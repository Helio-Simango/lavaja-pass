// Perfis, permissões e regras de credenciais (D-16 decidida a 18/10/2026: autenticação por perfil).
// Matriz da proposta v1 (secção 5) e do cap. 7.1 da v3. Regras puras: sem datas do sistema nem I/O.
import { AccessDeniedError, UnauthenticatedError, ValidationError } from './errors.js';

export const Role = Object.freeze({
  CUSTOMER: 'customer',
  OPERATOR: 'operator',
  MANAGER: 'manager',
  BANK_ANALYST: 'bank_analyst',
});

export const ROLE_LABELS = Object.freeze({
  [Role.CUSTOMER]: 'Cliente',
  [Role.OPERATOR]: 'Operador',
  [Role.MANAGER]: 'Gestor',
  [Role.BANK_ANALYST]: 'Analista bancário',
});

export const Permission = Object.freeze({
  YARD_READ: 'yard.read', // fila, postos, serviços e marcações do dia
  YARD_OPERATE: 'yard.operate', // registar serviços e clientes, mudar estados, marcações
  CASH_DECLARE: 'cash.declare', // declarar numerário em nome próprio
  DIGITAL_START: 'digital.start', // enviar o pedido de pagamento digital ao cliente
  CUSTOMERS_READ: 'customers.read',
  BUSINESS_READ: 'business.read', // painel, indicadores, histórico, capacidade, alterações
  CATALOG_MANAGE: 'catalog.manage', // preços, planos, postos, regras de fidelização
  PAYMENTS_MANAGE: 'payments.manage', // reembolsos e simulação do gateway
  RECONCILIATION_MANAGE: 'reconciliation.manage',
  SHARING_MANAGE: 'sharing.manage', // autorizar e revogar a partilha com bancos
  CAMPAIGNS_MANAGE: 'campaigns.manage',
  BANK_REPORTS: 'bank.reports', // relatórios autorizados à própria instituição
  SELF_SERVICE: 'self.service', // o cliente: os seus serviços, fidelização e pagamentos
});

const OPERATOR_PERMISSIONS = [
  Permission.YARD_READ,
  Permission.YARD_OPERATE,
  Permission.CASH_DECLARE,
  Permission.DIGITAL_START,
  Permission.CUSTOMERS_READ,
];

// O gestor vê toda a actividade da sua lavadora e também pode trabalhar no pátio.
const ROLE_PERMISSIONS = Object.freeze({
  [Role.CUSTOMER]: new Set([Permission.SELF_SERVICE]),
  [Role.OPERATOR]: new Set(OPERATOR_PERMISSIONS),
  [Role.MANAGER]: new Set([
    ...OPERATOR_PERMISSIONS,
    Permission.BUSINESS_READ,
    Permission.CATALOG_MANAGE,
    Permission.PAYMENTS_MANAGE,
    Permission.RECONCILIATION_MANAGE,
    Permission.SHARING_MANAGE,
    Permission.CAMPAIGNS_MANAGE,
  ]),
  [Role.BANK_ANALYST]: new Set([Permission.BANK_REPORTS]),
});

/** Duração das sessões, por perfil: o turno do operador é longo; o acesso bancário é curto. */
export const SESSION_TTL_MIN = Object.freeze({
  [Role.CUSTOMER]: 30,
  [Role.OPERATOR]: 10 * 60,
  [Role.MANAGER]: 8 * 60,
  [Role.BANK_ANALYST]: 2 * 60,
});

export function parseRole(value) {
  if (!Object.values(Role).includes(value)) throw new ValidationError(`Perfil desconhecido: ${value}.`, { field: 'role' });
  return value;
}

export function can(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function permissionsOf(role) {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/** @param session { role, ... } | null */
export function assertPermission(session, permission) {
  if (!session) throw new UnauthenticatedError();
  if (!can(session.role, permission)) {
    throw new AccessDeniedError('FORBIDDEN', `O perfil ${ROLE_LABELS[session.role] ?? session.role} não tem acesso a esta operação.`);
  }
}

// ---------- Credenciais ----------

const PIN = /^\d{4}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 10;

export function parsePin(value) {
  const pin = typeof value === 'string' ? value.trim() : '';
  if (!PIN.test(pin)) throw new ValidationError('O PIN tem 4 dígitos.', { field: 'pin' });
  return pin;
}

export function parseEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 120) throw new ValidationError('Indique um email válido.', { field: 'email' });
  return email;
}

export function parsePasswordInput(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new ValidationError('Indique a senha.', { field: 'password' });
  }
  return value;
}

/** Senha nova: pelo menos 10 caracteres, com letras e algarismos. */
export function assertStrongPassword(password) {
  const strong = typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH && /[a-z]/i.test(password) && /\d/.test(password);
  if (!strong) {
    throw new ValidationError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres, com letras e algarismos.`, { field: 'password' });
  }
}

// ---------- Bloqueio após tentativas falhadas ----------

export const LOCKOUT = Object.freeze({ maxAttempts: 5, minutes: 15 });

export function isLocked(user, nowIso) {
  return Boolean(user.lockedUntil && user.lockedUntil > nowIso);
}

/** Depois de uma tentativa falhada: conta e, ao atingir o limite, bloqueia durante 15 min. */
export function afterFailedAttempt(user, nowIso) {
  const failedAttempts = (user.failedAttempts ?? 0) + 1;
  if (failedAttempts < LOCKOUT.maxAttempts) return { failedAttempts, lockedUntil: null, locked: false };
  const lockedUntil = new Date(Date.parse(nowIso) + LOCKOUT.minutes * 60_000).toISOString();
  return { failedAttempts: 0, lockedUntil, locked: true };
}

// ---------- Código de acesso do cliente (enviado pela conversa) ----------

export const CUSTOMER_CODE = Object.freeze({ length: 6, ttlMin: 5, maxAttempts: 5, resendSeconds: 30 });

export function parseCustomerCode(value) {
  const code = typeof value === 'string' ? value.replace(/\s/g, '') : '';
  if (!new RegExp(`^\\d{${CUSTOMER_CODE.length}}$`).test(code)) {
    throw new ValidationError(`O código tem ${CUSTOMER_CODE.length} dígitos.`, { field: 'code' });
  }
  return code;
}

/** Um código só serve uma vez, dentro da validade e do limite de tentativas. */
export function codeUsable(code, nowIso) {
  return Boolean(code) && !code.usedAt && code.expiresAt > nowIso && code.attempts < CUSTOMER_CODE.maxAttempts;
}

// ---------- Sessão ----------

/** Conteúdo do token: o mínimo para autorizar sem consultar dados pessoais. */
export function sessionClaims(principal) {
  const claims = { sub: principal.subject, role: principal.role, name: principal.name };
  if (principal.institutionId) claims.inst = principal.institutionId;
  if (principal.customerId) claims.cid = principal.customerId;
  if (principal.sessionVersion !== undefined) claims.sv = principal.sessionVersion;
  return claims;
}
