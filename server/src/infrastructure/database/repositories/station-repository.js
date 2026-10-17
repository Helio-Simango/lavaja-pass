// Postos de lavagem e o serviço que ocupa cada um (em execução ou pronto).

const toStation = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  active: row.active === 1,
});

export class SqliteStationRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findById(id) {
    const row = this.#db.prepare('SELECT * FROM stations WHERE id = ?').get(id);
    return row ? toStation(row) : null;
  }

  list() {
    return this.#db.prepare('SELECT * FROM stations ORDER BY sort_order, id').all().map(toStation);
  }

  listWithOccupancy() {
    return this.#db
      .prepare(`SELECT s.*, w.id AS wash_id, w.status AS wash_status, w.plate AS wash_plate
        FROM stations s
        LEFT JOIN washes w ON w.station_id = s.id AND w.status IN ('in_progress', 'ready')
        ORDER BY s.sort_order, s.id`)
      .all()
      .map((row) => ({
        ...toStation(row),
        occupiedBy: row.wash_id ? { id: row.wash_id, status: row.wash_status, plate: row.wash_plate } : null,
      }));
  }

  setActive(id, active) {
    this.#db.prepare('UPDATE stations SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  }

  insert({ code, name, sortOrder }) {
    this.#db.prepare('INSERT INTO stations (code, name, sort_order) VALUES (?, ?, ?)').run(code, name, sortOrder);
  }
}
