import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let dbInstance = null;
let dbPathUsed = null;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS vacancies (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  url TEXT,
  title TEXT,
  company TEXT,
  fit_score REAL,
  route TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  raw_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vacancy_id TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  method TEXT,
  note TEXT,
  error TEXT,
  FOREIGN KEY (vacancy_id) REFERENCES vacancies(id)
);

CREATE TABLE IF NOT EXISTS seen (
  dedup_key TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cooldowns (
  key TEXT PRIMARY KEY,
  until_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
CREATE INDEX IF NOT EXISTS idx_applications_vacancy ON applications(vacancy_id);
`;

export function getDb(dbPath) {
  if (dbInstance && dbPathUsed === dbPath) return dbInstance;
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPathUsed = null;
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  dbInstance = db;
  dbPathUsed = dbPath;
  return db;
}

export function resetDbForTests() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPathUsed = null;
  }
}
