import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { config, PUBLIC_DIR } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { transaction } from '../src/db/tx.js';
import { createTestDb } from './helpers.js';

describe('base de dados', () => {
  it('fica fora da pasta pública', () => {
    assert.ok(!config.dbPath.startsWith(PUBLIC_DIR + path.sep));
  });

  it('aplica as migrações uma única vez', () => {
    const db = createTestDb({ seed: false });
    assert.deepEqual(migrate(db), []);
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
    assert.deepEqual(versions, ['001_foundation.sql', '002_catalog_customers.sql', '003_washes.sql']);
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

  it('o registo de alterações só aceita novos registos', () => {
    const db = createTestDb();
    db.prepare(`INSERT INTO change_log (entity, entity_id, field, actor, created_at)
      VALUES ('x', '1', 'f', 'teste', '2026-10-22')`).run();
    assert.throws(() => db.prepare("UPDATE change_log SET actor = 'outro'").run(), /só aceita novos registos/);
    assert.throws(() => db.prepare('DELETE FROM change_log').run(), /só aceita novos registos/);
    db.close();
  });

  it('o preço final tem de ser base − desconto − benefício', () => {
    const db = createTestDb();
    assert.throws(() => db.prepare('UPDATE washes SET final_price_cents = final_price_cents + 1 WHERE id = 1').run());
    db.close();
  });

  it('a transacção desfaz tudo em caso de erro, incluindo as aninhadas', () => {
    const db = createTestDb({ seed: false });
    const count = () => db.prepare('SELECT COUNT(*) AS n FROM settings').get().n;
    const insert = (key) =>
      db.prepare(`INSERT INTO settings (key, value_json, description, updated_at) VALUES (?, '1', 'x', 'now')`).run(key);
    assert.throws(() =>
      transaction(db, () => {
        insert('a');
        transaction(db, () => insert('b'));
        throw new Error('falha');
      }),
    );
    assert.equal(count(), 0);

    transaction(db, () => {
      insert('c');
      try {
        transaction(db, () => {
          insert('d');
          throw new Error('falha interna');
        });
      } catch {}
    });
    assert.deepEqual(db.prepare('SELECT key FROM settings').all().map((r) => r.key), ['c']);
    db.close();
  });

  it('os dados de demonstração incluem o Moza Banco como instituição de demonstração', () => {
    const db = createTestDb();
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'demo.institution'").get();
    assert.equal(JSON.parse(row.value_json), 'Moza Banco');
    db.close();
  });
});
