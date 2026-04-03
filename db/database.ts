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
import bcrypt from 'bcrypt';
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

  // Migration: remove CHECK constraints from stations and pricing to allow custom types
  const stationsSchema = await db.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='stations'`
  );
  if (stationsSchema?.sql?.includes('CHECK')) {
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec(`CREATE TABLE stations_new (id TEXT PRIMARY KEY, type TEXT NOT NULL)`);
    await db.exec(`INSERT INTO stations_new SELECT id, type FROM stations`);
    await db.exec(`DROP TABLE stations`);
    await db.exec(`ALTER TABLE stations_new RENAME TO stations`);
    await db.exec('PRAGMA foreign_keys = ON');
    console.log('[db] Migrated stations table — removed type CHECK constraint.');
  }

  const pricingSchema = await db.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='pricing'`
  );
  if (pricingSchema?.sql?.includes("CHECK (platform IN")) {
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec(`
      CREATE TABLE pricing_new (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        platform         TEXT    NOT NULL,
        player_tier      TEXT    NOT NULL CHECK (player_tier IN ('single','duo','trio','squad')),
        price_thirty_min INTEGER NOT NULL DEFAULT 0,
        price_one_hour   INTEGER NOT NULL DEFAULT 0,
        price_three_hour INTEGER NOT NULL DEFAULT 0,
        price_five_hour  INTEGER NOT NULL DEFAULT 0,
        UNIQUE (platform, player_tier)
      )
    `);
    await db.exec(`INSERT OR IGNORE INTO pricing_new SELECT * FROM pricing`);
    await db.exec(`DROP TABLE pricing`);
    await db.exec(`ALTER TABLE pricing_new RENAME TO pricing`);
    await db.exec('PRAGMA foreign_keys = ON');
    console.log('[db] Migrated pricing table — removed platform CHECK constraint.');
  }

  // Migration: ensure staff_password_hash is populated (existing DBs may have empty value)
  const hashRow = await db.get<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'staff_password_hash'"
  );
  if (hashRow && !hashRow.value) {
    const hash = await bcrypt.hash('cafe2024', 10);
    await db.run("UPDATE settings SET value = ? WHERE key = 'staff_password_hash'", hash);
    console.log('[db] Migrated staff_password_hash — default password hashed.');
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
