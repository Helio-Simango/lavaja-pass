import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrate } from '../../src/infrastructure/database/migrator.js';
import { SqliteUnitOfWork } from '../../src/infrastructure/database/unit-of-work.js';
import { createTestDb } from '../helpers.js';

describe('base de dados', () => {
  it('aplica as migrações uma única vez', () => {
    const db = createTestDb({ seed: false });
    assert.deepEqual(migrate(db), []);
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
    assert.deepEqual(versions, ['001_foundation.sql', '002_catalog_customers.sql', '003_washes.sql', '004_payments.sql']);
    db.close();
  });

  it('tem as chaves estrangeiras activas', () => {
    const db = createTestDb({ seed: false });
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    db.close();
  });

  it('aceita exactamente as classes A, B e C', () => {
    const db = createTestDb();
    const codes = db.prepare('SELECT code FROM vehicle_classes ORDER BY code').all().map((r) => r.code);
    assert.deepEqual(codes, ['A', 'B', 'C']);
    assert.throws(() =>
      db.prepare("INSERT INTO vehicle_classes (code, name, description, sort_order) VALUES ('D', 'D', 'D', 4)").run(),
    );
    db.close();
  });

  it('recusa preços negativos', () => {
    const db = createTestDb();
    assert.throws(() => db.prepare('UPDATE class_plan_prices SET price_cents = -1 WHERE plan_id = 1').run());
    db.close();
  });

  it('o registo de alterações e a auditoria só aceitam novos registos', () => {
    const db = createTestDb();
    db.prepare(`INSERT INTO change_log (entity, entity_id, field, actor, created_at)
      VALUES ('x', '1', 'f', 'teste', '2026-10-22')`).run();
    for (const table of ['change_log', 'wash_status_events']) {
      assert.throws(() => db.prepare(`UPDATE ${table} SET actor = 'outro'`).run(), /só aceita novos registos/);
      assert.throws(() => db.prepare(`DELETE FROM ${table}`).run(), /só aceita novos registos/);
    }
    db.close();
  });

  it('o preço final tem de ser base − desconto − benefício', () => {
    const db = createTestDb();
    assert.throws(() => db.prepare('UPDATE washes SET final_price_cents = final_price_cents + 1 WHERE id = 1').run());
    db.close();
  });

  it('um serviço em estado final não volta a um estado activo', () => {
    const db = createTestDb();
    db.prepare("UPDATE washes SET status = 'cancelled', cancelled_at = 'x', cancel_reason = 'teste' WHERE id = 3").run();
    assert.throws(() => db.prepare("UPDATE washes SET status = 'queued' WHERE id = 3").run(), /estado final/);
    db.close();
  });

  describe('unidade de trabalho', () => {
    const insertSetting = (db, key) =>
      db.prepare(`INSERT INTO settings (key, value_json, description, updated_at) VALUES (?, '1', 'x', 'now')`).run(key);
    const keys = (db) => db.prepare('SELECT key FROM settings ORDER BY key').all().map((r) => r.key);

    it('desfaz tudo em caso de erro, incluindo o trabalho aninhado', () => {
      const db = createTestDb({ seed: false });
      const unitOfWork = new SqliteUnitOfWork(db);
      assert.throws(() =>
        unitOfWork.run(() => {
          insertSetting(db, 'a');
          unitOfWork.run(() => insertSetting(db, 'b'));
          throw new Error('falha');
        }),
      );
      assert.deepEqual(keys(db), []);
      db.close();
    });

    it('um erro aninhado só desfaz a parte aninhada', () => {
      const db = createTestDb({ seed: false });
      const unitOfWork = new SqliteUnitOfWork(db);
      unitOfWork.run(() => {
        insertSetting(db, 'c');
        assert.throws(() =>
          unitOfWork.run(() => {
            insertSetting(db, 'd');
            throw new Error('falha interna');
          }),
        );
      });
      assert.deepEqual(keys(db), ['c']);
      db.close();
    });
  });

  it('os dados de demonstração incluem o Moza Banco como instituição de demonstração', () => {
    const db = createTestDb();
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'demo.institution'").get();
    assert.equal(JSON.parse(row.value_json), 'Moza Banco');
    db.close();
  });
});
