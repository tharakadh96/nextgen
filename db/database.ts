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

  // Migration: add station_type column + make station_id nullable with ON DELETE SET NULL
  // so that deleting a station with historical sessions never fails with a FK violation.
  const sessionsHasStationType = await db.get(
    `SELECT 1 FROM pragma_table_info('sessions') WHERE name = 'station_type'`
  );
  if (!sessionsHasStationType) {
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec(`
      CREATE TABLE sessions_new (
        id                    TEXT    PRIMARY KEY,
        station_id            TEXT    REFERENCES stations(id) ON DELETE SET NULL,
        station_type          TEXT,
        players               INTEGER NOT NULL CHECK (players BETWEEN 1 AND 4),
        duration_seconds      INTEGER NOT NULL,
        duration_label        TEXT    NOT NULL,
        start_time            TEXT,
        end_time              TEXT,
        ends_at               TEXT,
        revenue               INTEGER NOT NULL DEFAULT 0,
        status                TEXT    NOT NULL DEFAULT 'in-progress'
                              CHECK (status IN ('in-progress', 'completed', 'terminated')),
        termination_reason    TEXT,
        started_at            TEXT    NOT NULL,
        ended_at              TEXT,
        actual_seconds_played INTEGER
      )
    `);
    await db.exec(`
      INSERT INTO sessions_new
      SELECT ses.id, ses.station_id, st.type,
             ses.players, ses.duration_seconds, ses.duration_label,
             ses.start_time, ses.end_time, ses.ends_at,
             ses.revenue, ses.status, ses.termination_reason,
             ses.started_at, ses.ended_at, ses.actual_seconds_played
      FROM sessions ses
      LEFT JOIN stations st ON st.id = ses.station_id
    `);
    await db.exec(`DROP TABLE sessions`);
    await db.exec(`ALTER TABLE sessions_new RENAME TO sessions`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_station_id  ON sessions (station_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_status       ON sessions (status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_started_at  ON sessions (started_at)`);
    await db.exec('PRAGMA foreign_keys = ON');
    console.log('[db] Migrated sessions — station_type added, station_id nullable with ON DELETE SET NULL.');
  }

  // Migration: add accrued_revenue + billing_started_at for mid-session player adjustments
  for (const col of [
    'accrued_revenue INTEGER NOT NULL DEFAULT 0',
    'billing_started_at TEXT',
  ]) {
    try { await db.exec(`ALTER TABLE sessions ADD COLUMN ${col}`); } catch { /* already exists */ }
  }

  // Migration: seed cafe_name and cafe_logo_url if missing (older DBs)
  await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('cafe_name', 'Nextgen Gaming')`);
  await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('cafe_logo_url', 'https://olive-adjacent-orangutan-186.mypinata.cloud/ipfs/bafkreif3vvhdqi2dqa36ykkglkc73ku7m2mblm2mi46e5y7ktkdx7sm5pe')`);

  // Migration: add grace_period_minutes setting (minutes of grace after timer hits 0 before auto-end)
  await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('grace_period_minutes', '5')`);

  // Migration: create expenses table if it doesn't exist yet (older DBs)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      amount      INTEGER NOT NULL,
      date        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date)`);

  // Migration: create pricing_slots table for custom per-duration pricing
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pricing_slots (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      platform         TEXT    NOT NULL,
      player_tier      TEXT    NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price            INTEGER NOT NULL,
      UNIQUE(platform, player_tier, duration_minutes)
    )
  `);

  // Seed PS4 Single custom slots (INSERT OR IGNORE — safe to re-run)
  const ps4SingleSlots: [number, number][] = [
    [30, 100], [60, 150], [90, 220], [120, 300], [150, 370],
    [180, 400], [210, 460], [240, 530], [270, 600], [300, 600],
    [330, 660], [360, 720], [390, 780], [420, 840], [450, 900], [480, 960],
  ];
  for (const [mins, price] of ps4SingleSlots) {
    await db.run(
      `INSERT OR IGNORE INTO pricing_slots (platform, player_tier, duration_minutes, price) VALUES ('PS4', 'single', ?, ?)`,
      mins, price
    );
  }

  // Seed PS4 Duo custom slots (INSERT OR IGNORE — safe to re-run)
  const ps4DuoSlots: [number, number][] = [
    [30, 140], [60, 200], [90, 300], [120, 400], [150, 500],
    [180, 500], [210, 580], [240, 660], [270, 750], [300, 800],
    [330, 880], [360, 960], [390, 1040], [420, 1120], [450, 1200], [480, 1280],
  ];
  for (const [mins, price] of ps4DuoSlots) {
    await db.run(
      `INSERT OR IGNORE INTO pricing_slots (platform, player_tier, duration_minutes, price) VALUES ('PS4', 'duo', ?, ?)`,
      mins, price
    );
  }

  // Seed PS4 Trio custom slots (Duo ÷ 2 × 3)
  const ps4TrioSlots: [number, number][] = [
    [30, 210], [60, 300], [90, 450], [120, 600], [150, 750],
    [180, 750], [210, 870], [240, 990], [270, 1125], [300, 1200],
    [330, 1320], [360, 1440], [390, 1560], [420, 1680], [450, 1800], [480, 1920],
  ];
  for (const [mins, price] of ps4TrioSlots) {
    await db.run(
      `INSERT OR IGNORE INTO pricing_slots (platform, player_tier, duration_minutes, price) VALUES ('PS4', 'trio', ?, ?)`,
      mins, price
    );
  }

  // Seed PS4 Squad custom slots (Duo ÷ 2 × 4)
  const ps4SquadSlots: [number, number][] = [
    [30, 280], [60, 400], [90, 600], [120, 800], [150, 1000],
    [180, 1000], [210, 1160], [240, 1320], [270, 1500], [300, 1600],
    [330, 1760], [360, 1920], [390, 2080], [420, 2240], [450, 2400], [480, 2560],
  ];
  for (const [mins, price] of ps4SquadSlots) {
    await db.run(
      `INSERT OR IGNORE INTO pricing_slots (platform, player_tier, duration_minutes, price) VALUES ('PS4', 'squad', ?, ?)`,
      mins, price
    );
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
