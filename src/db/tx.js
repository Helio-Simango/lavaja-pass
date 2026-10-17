// Transacções síncronas; chamadas aninhadas usam SAVEPOINT.
const depths = new WeakMap();

export function transaction(db, fn) {
  const depth = depths.get(db) ?? 0;
  const savepoint = `sp_${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  depths.set(db, depth + 1);
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error('A função da transacção tem de ser síncrona.');
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (err) {
    if (depth === 0) db.exec('ROLLBACK');
    else db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw err;
  } finally {
    depths.set(db, depth);
  }
}
