// Erros de domínio. Não conhecem HTTP: a interface traduz cada tipo no código de estado adequado.

export class DomainError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** Dados inválidos (formato, tipo, campo em falta). */
export class ValidationError extends DomainError {
  constructor(message, details) {
    super('VALIDATION_ERROR', message, details);
  }
}

/** O recurso pedido não existe. */
export class NotFoundError extends DomainError {
  constructor(message = 'Recurso não encontrado.') {
    super('NOT_FOUND', message);
  }
}

/** O pedido é válido mas viola uma regra de negócio. */
export class ConflictError extends DomainError {}

/** O pedido é válido mas não há autorização para o acesso (ex.: autorização revogada ou expirada). */
export class AccessDeniedError extends DomainError {}
