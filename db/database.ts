/**
 * database.ts — SQLite connection singleton + schema initialization.
 *
 * Uses the `sqlite` async wrapper (already in package.json) over the
 * `sqlite3` driver.  `better-sqlite3` would be preferred for a pure
 * Node backend (synchronous API, better perf), but this project already
 * has sqlite/sqlite3 installed and `"type": "module"` in package.json,
 * so we stay consistent with the existing dependency tree.
 */

import { open, type Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// DB lives at project root — one level above this db/ directory.
const DB_PATH     = path.join(__dirname, '..', 'nextgen.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let _db: Database | null = null;

/**
 * Returns the shared database connection, initializing it on first call.
 * Safe to call multiple times — subsequent calls return the cached instance.
 */
export async function getDb(): Promise<Database> {
  if (_db) return _db;

  _db = await open({
    filename: DB_PATH,
    driver:   sqlite3.Database,
  });

  // These pragmas must be set on every connection.
  await _db.exec('PRAGMA journal_mode = WAL;');
  await _db.exec('PRAGMA foreign_keys  = ON;');
  // Reasonable busy timeout so concurrent requests queue rather than fail.
  await _db.exec('PRAGMA busy_timeout  = 5000;');

  await initSchema(_db);

  return _db;
}

/**
 * Runs the schema SQL file to create tables (all statements use
 * CREATE … IF NOT EXISTS, so this is idempotent).
 */
async function initSchema(db: Database): Promise<void> {
  const sql = await readFile(SCHEMA_PATH, 'utf-8');
  await db.exec(sql);

  // Migrations: add new columns to existing sessions table (safe to re-run)
  for (const col of ['start_time TEXT', 'end_time TEXT', 'ends_at TEXT']) {
    try {
      await db.exec(`ALTER TABLE sessions ADD COLUMN ${col}`);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  console.log('[db] Schema initialized.');
}

/**
 * Closes the database connection.  Call this on graceful shutdown.
 */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.close();
    _db = null;
    console.log('[db] Connection closed.');
  }
}
