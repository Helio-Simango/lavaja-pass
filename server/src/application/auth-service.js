// Autenticação dos quatro perfis (D-16 decidida): emite e valida as sessões (tokens JWT).
// - Operador: escolhe o nome e escreve o PIN de 4 dígitos (M6).
// - Gestor e analista bancário: email e senha.
// - Cliente: telefone e código de 6 dígitos enviado na conversa, ou o link de pagamento (M3/M4).
// As falhas não revelam qual dos dados está errado; 5 falhas seguidas bloqueiam 15 min.
import {
  afterFailedAttempt,
  assertStrongPassword,
  codeUsable,
  CUSTOMER_CODE,
  isLocked,
  LOCKOUT,
  parseCustomerCode,
  parseEmail,
  parsePasswordInput,
  parsePin,
  Role,
  SESSION_TTL_MIN,
  sessionClaims,
} from '../domain/access.js';
import { UnauthenticatedError, ValidationError } from '../domain/errors.js';
import { parsePhone } from '../domain/phone.js';

const TokenPurpose = Object.freeze({ SESSION: 'session', LINK: 'link' });
const PAYMENT_LINK_TTL_MIN = 60;
const INVALID_CREDENTIALS = 'Credenciais inválidas.';
// Usado quando o utilizador não existe, para a resposta demorar o mesmo (não revela quem existe).
const DECOY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export class AuthService {
  #users;
  #customers;
  #tokens;
  #hasher;
  #random;
  #conversationService;
  #unitOfWork;
  #clock;

  constructor({ userRepository, customerRepository, tokenService, passwordHasher, random, conversationService, unitOfWork, clock }) {
    this.#users = userRepository;
    this.#customers = customerRepository;
    this.#tokens = tokenService;
    this.#hasher = passwordHasher;
    this.#random = random;
    this.#conversationService = conversationService;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  /** Nomes dos operadores activos para o ecrã de entrada (M6). Sem outros dados. */
  operatorRoster() {
    return this.#users.listOperators().map(({ id, name }) => ({ id, name }));
  }

  loginOperator({ operatorId, pin }) {
    const secret = parsePin(pin);
    return this.#attempt(() => {
      const user = Number.isSafeInteger(operatorId) ? this.#users.findById(operatorId) : null;
      const operator = user?.role === Role.OPERATOR ? user : null;
      return this.#checkSecret(operator, secret, operator?.pinHash);
    });
  }

  /** Gestor ou analista bancário. */
  loginStaff({ email, password }) {
    const address = parseEmail(email);
    const secret = parsePasswordInput(password);
    return this.#attempt(() => {
      const user = this.#users.findByEmail(address);
      const staff = user && user.role !== Role.OPERATOR ? user : null;
      return this.#checkSecret(staff, secret, staff?.passwordHash);
    });
  }

  /**
   * Envia um código de acesso na conversa do cliente. A resposta é sempre a mesma, exista ou não
   * um cliente com este telefone.
   */
  requestCustomerCode(rawPhone) {
    const phone = parsePhone(rawPhone);
    return this.#unitOfWork.run(() => {
      const customer = this.#customers.findByPhone(phone);
      const now = this.#clock.nowIso();
      if (customer && this.#canSendCode(customer.id, now)) {
        const code = this.#random.digits(CUSTOMER_CODE.length);
        const expiresAt = addMinutes(now, CUSTOMER_CODE.ttlMin);
        this.#users.insertCustomerCode({ customerId: customer.id, codeHash: this.#hasher.hash(code), expiresAt }, now);
        this.#conversationService.notifyPhone(
          phone,
          `🔐 Código de acesso ao LavaJá Pass: *${code}*\nVálido ${CUSTOMER_CODE.ttlMin} minutos. Não o partilhe com ninguém.`,
        );
        this.#users.appendAuthEvent({ role: Role.CUSTOMER, subject: customer.id, event: 'code_sent' }, now);
      }
      return { sent: true, ttlMinutes: CUSTOMER_CODE.ttlMin };
    });
  }

  verifyCustomerCode({ phone: rawPhone, code: rawCode }) {
    const phone = parsePhone(rawPhone);
    const code = parseCustomerCode(rawCode);
    const invalid = () => ({ failure: new UnauthenticatedError('Código inválido ou expirado. Peça um novo.', 'INVALID_CODE') });
    return this.#attempt(() => {
      const now = this.#clock.nowIso();
      const customer = this.#customers.findByPhone(phone);
      const stored = customer ? this.#users.latestCustomerCode(customer.id) : null;
      if (!customer || !codeUsable(stored, now)) return invalid();
      if (!this.#hasher.verify(code, stored.codeHash)) {
        this.#users.countCodeAttempt(stored.id);
        this.#users.appendAuthEvent({ role: Role.CUSTOMER, subject: customer.id, event: 'login_failed' }, now);
        return invalid();
      }
      this.#users.markCodeUsed(stored.id, now);
      this.#users.appendAuthEvent({ role: Role.CUSTOMER, subject: customer.id, event: 'login' }, now);
      return { result: this.#issueSession(customerPrincipal(customer)) };
    });
  }

  /** Link de pagamento enviado na conversa (M3): abre o checkout (M4) já com a sessão do cliente. */
  issuePaymentLink({ customerId, customerName, washId }) {
    const claims = { ...sessionClaims(customerPrincipal({ id: customerId, name: customerName })), purpose: TokenPurpose.LINK, wid: washId };
    return this.#tokens.issue(claims, PAYMENT_LINK_TTL_MIN).token;
  }

  /** Troca o token do link por uma sessão normal do cliente. */
  redeemLink(token) {
    const claims = this.#tokens.verify(token);
    if (!claims || claims.purpose !== TokenPurpose.LINK || claims.role !== Role.CUSTOMER) {
      throw new UnauthenticatedError('Link inválido ou expirado. Peça um novo na conversa.', 'INVALID_LINK');
    }
    const customer = this.#customers.findById(claims.cid);
    if (!customer) throw new UnauthenticatedError('Link inválido ou expirado. Peça um novo na conversa.', 'INVALID_LINK');
    this.#users.appendAuthEvent({ role: Role.CUSTOMER, subject: customer.id, event: 'link_used', detail: `wash ${claims.wid}` }, this.#clock.nowIso());
    return { ...this.#issueSession(customerPrincipal(customer)), washId: claims.wid ?? null };
  }

  /**
   * Valida o token de cada pedido. Para os utilizadores da lavadora e do banco confirma também
   * que a conta continua activa e que a sessão não foi revogada (session_version).
   * @returns a sessão: { role, subject, name, userId?, customerId?, institutionId?, expiresAt }
   */
  authenticate(token) {
    const claims = this.#tokens.verify(token);
    if (!claims || claims.purpose !== TokenPurpose.SESSION) throw new UnauthenticatedError();
    const session = { role: claims.role, subject: claims.sub, name: claims.name, expiresAt: new Date(claims.exp * 1000).toISOString() };
    if (claims.role === Role.CUSTOMER) {
      if (!this.#customers.findById(claims.cid)) throw new UnauthenticatedError();
      return { ...session, customerId: claims.cid };
    }
    const user = this.#users.findById(Number(String(claims.sub).replace('user:', '')));
    if (!user || !user.active || user.role !== claims.role || user.sessionVersion !== claims.sv) throw new UnauthenticatedError();
    return { ...session, userId: user.id, institutionId: user.institutionId ?? undefined, institutionName: user.institutionName ?? undefined };
  }

  logout(session) {
    if (!session) return;
    this.#users.appendAuthEvent({ role: session.role, subject: session.subject, event: 'logout' }, this.#clock.nowIso());
  }

  /** Cria um utilizador da lavadora ou do banco (dados de demonstração e administração). */
  createUser({ role, name, email, pin, password, institutionId }) {
    if (role === Role.OPERATOR) {
      return this.#users.insert({ role, name, pinHash: this.#hasher.hash(parsePin(pin)) }, this.#clock.nowIso());
    }
    if (role !== Role.MANAGER && role !== Role.BANK_ANALYST) throw new ValidationError(`Perfil sem conta de utilizador: ${role}.`);
    assertStrongPassword(password);
    return this.#users.insert(
      { role, name, email: parseEmail(email), passwordHash: this.#hasher.hash(parsePasswordInput(password)), institutionId },
      this.#clock.nowIso(),
    );
  }

  recentEvents() {
    return this.#users.listAuthEvents();
  }

  #checkSecret(user, secret, storedHash) {
    const now = this.#clock.nowIso();
    if (user && isLocked(user, now)) return { failure: lockedError() };
    const valid = this.#hasher.verify(secret, storedHash ?? DECOY_HASH);
    if (!user || !user.active || !valid) {
      const locked = user ? this.#recordFailure(user, now) : false;
      return { failure: locked ? lockedError() : new UnauthenticatedError(INVALID_CREDENTIALS, 'INVALID_CREDENTIALS') };
    }
    this.#users.recordAttempt(user.id, { failedAttempts: 0, lockedUntil: null }, now);
    this.#users.appendAuthEvent({ role: user.role, subject: user.id, event: 'login' }, now);
    return { result: this.#issueSession(staffPrincipal(user)) };
  }

  /** As falhas ficam registadas (contagem, bloqueio, auditoria) mesmo quando a entrada é recusada. */
  #attempt(work) {
    const { result, failure } = this.#unitOfWork.run(work);
    if (failure) throw failure;
    return result;
  }

  #recordFailure(user, now) {
    const result = afterFailedAttempt(user, now);
    this.#users.recordAttempt(user.id, result, now);
    this.#users.appendAuthEvent({ role: user.role, subject: user.id, event: result.locked ? 'locked' : 'login_failed' }, now);
    return result.locked;
  }

  #canSendCode(customerId, now) {
    const last = this.#users.latestCustomerCode(customerId);
    return !last || Date.parse(now) - Date.parse(last.createdAt) >= CUSTOMER_CODE.resendSeconds * 1000;
  }

  #issueSession(principal) {
    const ttl = SESSION_TTL_MIN[principal.role];
    const { token, expiresAt } = this.#tokens.issue({ ...sessionClaims(principal), purpose: TokenPurpose.SESSION }, ttl);
    const { sessionVersion, ...session } = principal;
    return { token, expiresAt, session: { ...session, expiresAt } };
  }
}

function staffPrincipal(user) {
  return {
    subject: `user:${user.id}`,
    role: user.role,
    name: user.name,
    institutionId: user.institutionId ?? undefined,
    institutionName: user.institutionName ?? undefined,
    sessionVersion: user.sessionVersion,
  };
}

function customerPrincipal(customer) {
  return { subject: `customer:${customer.id}`, role: Role.CUSTOMER, name: customer.name, customerId: customer.id };
}

function lockedError() {
  return new UnauthenticatedError(
    `Conta bloqueada após ${LOCKOUT.maxAttempts} tentativas falhadas. Tente de novo dentro de ${LOCKOUT.minutes} minutos.`,
    'ACCOUNT_LOCKED',
  );
}

function addMinutes(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}
