import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const IN_MEMORY = ':memory:';

export function openDatabase(file) {
  const inMemory = file === IN_MEMORY;
  if (!inMemory) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (!inMemory) db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

export function removeDatabaseFiles(file) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
}
