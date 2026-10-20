import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cheminDb = process.env.DB_PATH
  ?? fileURLToPath(new URL('../data/dashboard.db', import.meta.url));

const db = new Database(cheminDb);
db.pragma('journal_mode = WAL');
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

export default db;
