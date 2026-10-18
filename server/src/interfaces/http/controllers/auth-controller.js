// Entrada e saída dos quatro perfis (I-11). As respostas de erro não dizem qual dos dados falhou.
import { permissionsOf, ROLE_LABELS } from '../../../domain/access.js';
import { UnauthenticatedError } from '../../../domain/errors.js';
import { bodyOf } from '../request.js';
import { clearSessionCookie, requestedProfile, SESSION_PROFILES, setSessionCookie } from '../session.js';

export function createAuthController({ authService }, { secureCookies, clock }) {
  const cookieOptions = { secure: secureCookies };

  function signIn(res, { token, expiresAt, session }, extra = {}) {
    // O token não vai no corpo: só no cookie HttpOnly, fora do alcance do JavaScript da página.
    const profile = setSessionCookie(res, session.role, { token, expiresAt }, { ...cookieOptions, now: clock.now() });
    res.set('Cache-Control', 'no-store');
    res.json({ session: presentSession(session), profile, home: SESSION_PROFILES[profile].home, expiresAt, ...extra });
  }

  return {
    /** Nomes para o ecrã de entrada do operador (M6). */
    operators(req, res) {
      res.json({ operators: authService.operatorRoster() });
    },

    loginOperator(req, res) {
      const body = bodyOf(req);
      signIn(res, authService.loginOperator({ operatorId: Number(body.operatorId), pin: body.pin }));
    },

    loginStaff(req, res) {
      const body = bodyOf(req);
      signIn(res, authService.loginStaff({ email: body.email, password: body.password }));
    },

    requestCustomerCode(req, res) {
      res.status(202).json(authService.requestCustomerCode(bodyOf(req).phone));
    },

    verifyCustomerCode(req, res) {
      const body = bodyOf(req);
      signIn(res, authService.verifyCustomerCode({ phone: body.phone, code: body.code }));
    },

    /** Link de pagamento da conversa (M3 → M4). */
    redeemLink(req, res) {
      const { washId, ...result } = authService.redeemLink(bodyOf(req).token);
      signIn(res, result, { washId });
    },

    current(req, res) {
      if (!req.session) throw req.sessionError ?? new UnauthenticatedError();
      res.json({ session: presentSession(req.session) });
    },

    logout(req, res) {
      authService.logout(req.session);
      const profile = requestedProfile(req);
      if (profile) clearSessionCookie(res, profile, cookieOptions);
      res.json({ status: 'logged_out' });
    },
  };
}

function presentSession(session) {
  return {
    role: session.role,
    roleLabel: ROLE_LABELS[session.role],
    name: session.name,
    customerId: session.customerId,
    institutionId: session.institutionId,
    institutionName: session.institutionName,
    expiresAt: session.expiresAt,
    permissions: permissionsOf(session.role),
  };
}
