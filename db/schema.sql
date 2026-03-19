-- =============================================================================
-- Nextgen Gaming Station Management — SQLite Schema
-- =============================================================================
-- Pragmas are applied at connection time in database.ts, not here.
-- All monetary values are stored as INTEGER (Philippine Peso centavos would be
-- ideal, but the frontend works in whole-peso integers so we mirror that).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- stations
-- Represents the 8 physical gaming machines. Rates are stored in the
-- pricing table; the station row itself just holds identity + live state.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stations (
  id          TEXT    PRIMARY KEY,           -- e.g. "PS5-01"
  type        TEXT    NOT NULL               -- 'PS5' | 'PS4'
              CHECK (type IN ('PS5', 'PS4'))
);

-- ---------------------------------------------------------------------------
-- pricing
-- One row per (platform, player_tier). All price columns are in whole pesos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  platform        TEXT    NOT NULL CHECK (platform IN ('PS5', 'PS4')),
  player_tier     TEXT    NOT NULL CHECK (player_tier IN ('single', 'duo', 'trio', 'squad')),
  price_thirty_min  INTEGER NOT NULL DEFAULT 0,
  price_one_hour    INTEGER NOT NULL DEFAULT 0,
  price_three_hour  INTEGER NOT NULL DEFAULT 0,
  price_five_hour   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (platform, player_tier)
);

-- ---------------------------------------------------------------------------
-- sessions
-- One row per active/completed/terminated session.
-- A station can have at most one active session at a time (enforced by the
-- application layer and the active_session_id column on station_state).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT    PRIMARY KEY,        -- UUID v4
  station_id          TEXT    NOT NULL REFERENCES stations(id),
  players             INTEGER NOT NULL CHECK (players BETWEEN 1 AND 4),
  duration_seconds    INTEGER NOT NULL,           -- booked duration (end_time - start_time)
  duration_label      TEXT    NOT NULL,           -- e.g. "14:00 - 16:00"
  start_time          TEXT,                       -- HH:MM user-entered start
  end_time            TEXT,                       -- HH:MM user-entered end
  ends_at             TEXT,                       -- ISO-8601 UTC absolute end time
  revenue             INTEGER NOT NULL DEFAULT 0, -- whole pesos
  status              TEXT    NOT NULL DEFAULT 'in-progress'
                      CHECK (status IN ('in-progress', 'completed', 'terminated')),
  termination_reason  TEXT,                       -- only set when status = 'terminated'
  started_at          TEXT    NOT NULL,           -- ISO-8601 UTC wall-clock session start
  ended_at            TEXT,                       -- ISO-8601 UTC, NULL while active
  actual_seconds_played INTEGER                   -- calculated on end/terminate
);

CREATE INDEX IF NOT EXISTS idx_sessions_station_id   ON sessions (station_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status        ON sessions (status);
-- Reports query by date; storing started_at as ISO text means substr() works.
CREATE INDEX IF NOT EXISTS idx_sessions_started_at   ON sessions (started_at);

-- ---------------------------------------------------------------------------
-- station_state
-- Mutable live state separated from the identity row so hot-path updates
-- touch a narrow table and the sessions history stays append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS station_state (
  station_id          TEXT    PRIMARY KEY REFERENCES stations(id),
  status              TEXT    NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available', 'busy', 'completed')),
  active_session_id   TEXT    REFERENCES sessions(id),  -- NULL when available
  pending_revenue     INTEGER,                          -- set when status = 'completed'
  actual_seconds_played INTEGER                         -- set when status = 'completed'
);

-- ---------------------------------------------------------------------------
-- settings
-- Simple key/value store for application-wide configuration.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default settings rows (INSERT OR IGNORE so re-runs are safe)
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('admin_pin',        '1234'),
  ('auto_end_sessions', 'true'),
  ('min_duration_price', '30');
