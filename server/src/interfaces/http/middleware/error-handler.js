// Erros centralizados no formato { "error": { "code", "message", "details?" } }.
// Um 500 nunca expõe detalhes internos.
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../../../domain/errors.js';

const STATUS_BY_ERROR = new Map([
  [ValidationError, 400],
  [NotFoundError, 404],
  [ConflictError, 409],
]);

const BODY_PARSER_ERRORS = Object.freeze({
  'entity.parse.failed': [400, 'INVALID_JSON', 'O corpo do pedido não é JSON válido.'],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Pedido demasiado grande.'],
});

export function apiNotFound(req, res) {
  sendError(res, 404, 'NOT_FOUND', `Rota inexistente: ${req.method} ${req.originalUrl}`);
}

export function createErrorHandler({ logger = console } = {}) {
  return function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);

    if (error instanceof DomainError) {
      return sendError(res, statusOf(error), error.code, error.message, error.details);
    }
    if (error?.type in BODY_PARSER_ERRORS) {
      return sendError(res, ...BODY_PARSER_ERRORS[error.type]);
    }
    // Uma restrição da base violada é um conflito com uma regra de dados, não um erro interno.
    if (isConstraintViolation(error)) {
      return sendError(res, 409, 'CONSTRAINT_VIOLATION', 'O pedido viola uma regra de dados.');
    }
    logger.error(error);
    return sendError(res, 500, 'INTERNAL_ERROR', 'Erro interno.');
  };
}

function statusOf(error) {
  for (const [ErrorType, status] of STATUS_BY_ERROR) if (error instanceof ErrorType) return status;
  return 400;
}

function isConstraintViolation(error) {
  return error?.code === 'ERR_SQLITE_ERROR' && /constraint|estado final|só aceita novos registos/i.test(error.message);
}

function sendError(res, status, code, message, details) {
  const body = { code, message };
  if (details !== undefined) body.details = details;
  res.status(status).json({ error: body });
}
