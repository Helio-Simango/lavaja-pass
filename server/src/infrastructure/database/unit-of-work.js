// Unidade de trabalho: tudo o que corre dentro de run() é confirmado ou desfeito em conjunto.
// Chamadas aninhadas usam SAVEPOINT, por isso um caso de uso pode chamar outro.

export class SqliteUnitOfWork {
  #db;
  #depth = 0;

  constructor(db) {
    this.#db = db;
  }

  run(work) {
    const savepoint = `sp_${this.#depth}`;
    const outermost = this.#depth === 0;
    this.#db.exec(outermost ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.#depth += 1;
    try {
      const result = work();
      if (result instanceof Promise) throw new Error('A unidade de trabalho só aceita funções síncronas.');
      this.#db.exec(outermost ? 'COMMIT' : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      this.#db.exec(outermost ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      throw error;
    } finally {
      this.#depth -= 1;
    }
  }
}
