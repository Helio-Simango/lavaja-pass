// Erros de negócio e de validação num formato único:
// { "error": { "code", "message", "details?" } }

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  toJSON() {
    const error = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const validationError = (message, details) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const notFound = (message = 'Recurso não encontrado.') =>
  new AppError(404, 'NOT_FOUND', message);

// 409: o pedido é válido mas viola uma regra de negócio.
export const conflict = (code, message, details) => new AppError(409, code, message, details);
