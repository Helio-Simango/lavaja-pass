import { AppError } from '../lib/errors.js';

export function apiNotFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Rota inexistente: ${req.method} ${req.originalUrl}` } });
}

// Erros centralizados. Um 500 nunca expõe detalhes internos.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof AppError) return res.status(err.status).json(err.toJSON());
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'O corpo do pedido não é JSON válido.' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Pedido demasiado grande.' } });
  }
  // Uma restrição da base de dados violada é um conflito com uma regra, não um erro interno.
  if (err?.code === 'ERR_SQLITE_ERROR' && /constraint|serviço em estado final/i.test(err.message)) {
    return res.status(409).json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'O pedido viola uma regra de dados.' } });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } });
}
