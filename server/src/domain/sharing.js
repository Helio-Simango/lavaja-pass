// Partilha com instituições bancárias (cap. 9.1 e 14.1): só com autorização explícita da lavadora,
// para uma instituição, com finalidade, âmbito, período de dados e validade; revogável.
// O relatório é informação adicional: não é uma pontuação de crédito.
import { AccessDeniedError, ConflictError, ValidationError } from './errors.js';

export const ReportSection = Object.freeze({
  ACTIVITY: 'activity',
  RECEIPTS: 'receipts',
  CUSTOMERS: 'customers',
  DATA_QUALITY: 'data_quality',
});

export const SECTION_LABELS = Object.freeze({
  activity: 'Actividade',
  receipts: 'Recebimentos por origem',
  customers: 'Clientes (agregado)',
  data_quality: 'Qualidade dos dados',
});

export const AuthorizationStatus = Object.freeze({ ACTIVE: 'active', REVOKED: 'revoked', EXPIRED: 'expired' });

const PURPOSE_MIN = 10;
const PURPOSE_MAX = 200;
const DAY_MS = 86_400_000;
const MONTH_DAYS = 30;

/** Pedido de autorização feito pela lavadora (M15). */
export function parseAuthorizationRequest({ purpose, sections, dataMonths, validDays, confirmed }) {
  const text = typeof purpose === 'string' ? purpose.trim() : '';
  if (text.length < PURPOSE_MIN || text.length > PURPOSE_MAX) {
    throw new ValidationError(`Indique a finalidade (${PURPOSE_MIN} a ${PURPOSE_MAX} caracteres).`, { field: 'purpose' });
  }
  const known = Object.values(ReportSection);
  if (!Array.isArray(sections) || sections.length === 0 || sections.some((s) => !known.includes(s))) {
    throw new ValidationError(`Escolha o âmbito: uma ou mais secções entre ${known.join(', ')}.`, { field: 'sections' });
  }
  if (!Number.isSafeInteger(dataMonths) || dataMonths < 1 || dataMonths > 24) {
    throw new ValidationError('O período de dados deve ser de 1 a 24 meses.', { field: 'dataMonths' });
  }
  if (!Number.isSafeInteger(validDays) || validDays < 1 || validDays > 365) {
    throw new ValidationError('A validade deve ser de 1 a 365 dias.', { field: 'validDays' });
  }
  if (confirmed !== true) {
    throw new ValidationError('A autorização tem de ser confirmada explicitamente pela lavadora ("confirm": true).', {
      field: 'confirm',
    });
  }
  return { purpose: text, sections: known.filter((s) => sections.includes(s)), dataMonths, validDays };
}

export function newAuthorization(request, { institution, sequence, actor, now }) {
  return {
    reference: `AUT-${String(sequence).padStart(3, '0')}`,
    institutionId: institution.id,
    purpose: request.purpose,
    sections: request.sections,
    dataMonths: request.dataMonths,
    validUntil: new Date(Date.parse(now) + request.validDays * DAY_MS).toISOString(),
    grantedBy: actor,
    grantedAt: now,
  };
}

export function authorizationStatus(authorization, now) {
  if (authorization.revokedAt) return AuthorizationStatus.REVOKED;
  if (authorization.validUntil <= now) return AuthorizationStatus.EXPIRED;
  return AuthorizationStatus.ACTIVE;
}

/** Nenhuma instituição consulta sem uma autorização activa e dirigida a ela (cap. 14.1). */
export function assertCanAccess(authorization, institutionId, now) {
  if (authorization.institutionId !== institutionId) {
    throw new AccessDeniedError('AUTHORIZATION_OTHER_INSTITUTION', 'Esta autorização não foi dada a esta instituição.');
  }
  const status = authorizationStatus(authorization, now);
  if (status === AuthorizationStatus.REVOKED) {
    throw new AccessDeniedError('AUTHORIZATION_REVOKED', `A autorização ${authorization.reference} foi revogada pela lavadora.`);
  }
  if (status === AuthorizationStatus.EXPIRED) {
    throw new AccessDeniedError('AUTHORIZATION_EXPIRED', `A autorização ${authorization.reference} expirou.`);
  }
}

/** Período de dados que a autorização cobre, a contar de "agora". */
export function authorizedPeriod(authorization, now) {
  return { from: new Date(Date.parse(now) - authorization.dataMonths * MONTH_DAYS * DAY_MS).toISOString(), to: now };
}

/** Revogar termina as novas consultas; repetir não tem efeitos. */
export function planRevoke(authorization, { reason, actor, now }) {
  if (authorization.revokedAt) return { changed: false };
  if (authorizationStatus(authorization, now) === AuthorizationStatus.EXPIRED) {
    throw new ConflictError('AUTHORIZATION_EXPIRED', 'A autorização já expirou.');
  }
  const text = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
  return { changed: true, changes: { revokedAt: now, revokedBy: actor, revokeReason: text || null } };
}

/** Notas fixas de todos os relatórios (cap. 9.3, ponto 6). */
export const REPORT_NOTES = Object.freeze([
  'Este relatório é informação adicional, autorizada pela lavadora. Não é uma avaliação nem uma pontuação de crédito, não demonstra capacidade de reembolso e não substitui a análise do banco.',
  'O digital confirmado resulta de uma simulação (protótipo): não são transacções reais.',
  'O numerário é declarado por operadores identificados e não é verificado por uma fonte externa.',
  'Indicadores agregados: não inclui nomes nem telefones dos clientes finais.',
  'Protótipo sem autenticação (D-16) e com dados de demonstração fictícios.',
]);
