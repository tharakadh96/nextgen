/**
 * routes/stations.ts — Station management endpoints.
 *
 * GET  /api/stations              — list all stations with live session data
 * POST /api/stations/:id/start    — start a session  { players, startTime, endTime }
 * POST /api/stations/:id/end      — mark session completed (pending collection)
 * POST /api/stations/:id/terminate— terminate session with reason
 * POST /api/stations/:id/collect  — collect pending revenue → logs + reset
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/database.js';
import { type Database } from 'sqlite';

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StationRow {
  id:     string;
  type:   string;
  status: 'available' | 'busy' | 'completed';
  active_session_id:      string | null;
  pending_revenue:        number | null;
  actual_seconds_played:  number | null;
}

interface SessionRow {
  id:                   string;
  station_id:           string;
  players:              number;
  duration_seconds:     number;
  duration_label:       string;
  start_time:           string | null;  // HH:MM user-entered
  end_time:             string | null;  // HH:MM user-entered
  ends_at:              string | null;  // ISO-8601 absolute end time
  revenue:              number;
  status:               'in-progress' | 'completed' | 'terminated';
  termination_reason:   string | null;
  started_at:           string;
  ended_at:             string | null;
  actual_seconds_played: number | null;
}

interface PricingRow {
  platform:         string;
  player_tier:      string;
  price_thirty_min: number;
  price_one_hour:   number;
  price_three_hour: number;
  price_five_hour:  number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given HH:MM start and end times, compute:
 *   - ends_at: absolute ISO-8601 UTC datetime (handles overnight)
 *   - durationSeconds: total booked seconds (end_time - start_time)
 *
 * ends_at = now + durationSeconds so the countdown starts from the
 * moment the operator clicks Start, regardless of clock drift between
 * the entered start_time and wall-clock time.
 */
function computeSession(startTime: string, endTime: string): {
  endsAt:          string;
  durationSeconds: number;
  durationLabel:   string;
} {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  let durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
  if (durationMinutes <= 0) durationMinutes += 24 * 60; // overnight

  const durationSeconds = durationMinutes * 60;

  // Anchor endsAt to the actual endTime clock on today's date (tomorrow if overnight)
  const candidate = new Date();
  candidate.setHours(eh, em, 0, 0);
  if (candidate.getTime() <= Date.now()) candidate.setDate(candidate.getDate() + 1);

  return {
    endsAt:        candidate.toISOString(),
    durationSeconds,
    durationLabel: `${startTime} - ${endTime}`,
  };
}

/**
 * Seconds remaining until ends_at. Negative means overtime.
 */
function remainingSeconds(endsAt: string): number {
  return Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000);
}

/**
 * Elapsed seconds since the session started (wall-clock).
 */
function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

/**
 * Formats a duration in seconds to "HHh MMm".
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Formats remaining seconds to "HH:MM:SS" countdown string.
 * Returns a negative-prefixed string if overtime.
 */
function formatCountdown(remaining: number): string {
  const abs  = Math.abs(remaining);
  const h    = Math.floor(abs / 3600);
  const m    = Math.floor((abs % 3600) / 60);
  const s    = abs % 60;
  const base = [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  return remaining < 0 ? `-${base}` : base;
}

/**
 * Calculates revenue for a session given the station type, player count,
 * and booked duration in seconds. Falls back to the minimum duration price.
 */
async function calculateRevenue(
  db:              Database,
  platform:        string,
  players:         number,
  durationSeconds: number
): Promise<number> {
  const tier =
    players === 4 ? 'squad'  :
    players === 3 ? 'trio'   :
    players === 2 ? 'duo'    : 'single';

  const pricing = await db.get<PricingRow>(
    `SELECT * FROM pricing WHERE platform = ? AND player_tier = ?`,
    platform, tier
  );

  const minPriceSetting = await db.get<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'min_duration_price'`
  );
  const minPrice = minPriceSetting ? parseInt(minPriceSetting.value, 10) : 30;

  if (!pricing) return minPrice;

  const GRACE = 5; // minutes grace period after each milestone
  const durationMinutes = durationSeconds / 60;

  // Apply grace period: if within 5 minutes over a milestone, treat as that milestone
  let billedMinutes = durationMinutes;
  if (durationMinutes > 30  && durationMinutes <= 30  + GRACE) billedMinutes = 30;
  if (durationMinutes > 60  && durationMinutes <= 60  + GRACE) billedMinutes = 60;
  if (durationMinutes > 180 && durationMinutes <= 180 + GRACE) billedMinutes = 180;
  if (durationMinutes > 300 && durationMinutes <= 300 + GRACE) billedMinutes = 300;

  let revenue: number;
  if (billedMinutes <= 30) {
    revenue = pricing.price_thirty_min;
  } else if (billedMinutes <= 60) {
    revenue = pricing.price_one_hour;
  } else if (billedMinutes <= 180) {
    revenue = billedMinutes === 180
      ? pricing.price_three_hour
      : Math.round(pricing.price_one_hour * (billedMinutes / 60));
  } else if (billedMinutes <= 300) {
    revenue = billedMinutes === 300
      ? pricing.price_five_hour
      : Math.round(pricing.price_one_hour * (billedMinutes / 60));
  } else {
    revenue = Math.round(pricing.price_one_hour * (billedMinutes / 60));
  }

  return Math.max(revenue, minPrice);
}

/**
 * Builds the full station response shape expected by the frontend.
 */
async function buildStationResponse(
  db:      Database,
  station: StationRow
): Promise<object> {
  const pricingRows = await db.all<PricingRow[]>(
    `SELECT * FROM pricing WHERE platform = ?`,
    station.type
  );

  const rates: Record<string, object> = {};
  for (const row of pricingRows) {
    rates[row.player_tier] = {
      hourly:    row.price_one_hour,
      thirtyMin: row.price_thirty_min,
      threeHour: row.price_three_hour,
      fiveHour:  row.price_five_hour,
    };
  }

  const base = { id: station.id, type: station.type, status: station.status, rates };

  if (station.status === 'available') return base;

  const session = station.active_session_id
    ? await db.get<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, station.active_session_id)
    : null;

  if (!session) return base;

  if (station.status === 'busy') {
    // Use ends_at for accurate countdown; fall back to elapsed-based calc for old rows
    const remaining = session.ends_at
      ? remainingSeconds(session.ends_at)
      : session.duration_seconds - elapsedSeconds(session.started_at);

    return {
      ...base,
      remainingSeconds: remaining,
      remainingTime:    formatCountdown(remaining),
      totalSeconds:     session.duration_seconds,
      players:          session.players,
      startTime:        session.start_time,
      endTime:          session.end_time,
    };
  }

  // status === 'completed' — waiting for collection
  return {
    ...base,
    players:             session.players,
    pendingRevenue:      station.pending_revenue ?? 0,
    actualSecondsPlayed: station.actual_seconds_played ?? 0,
    startTime:           session.start_time,
    endTime:             session.end_time,
  };
}

// ---------------------------------------------------------------------------
// GET /api/stations
// ---------------------------------------------------------------------------
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();

    const rows = await db.all<StationRow[]>(`
      SELECT
        s.id,
        s.type,
        ss.status,
        ss.active_session_id,
        ss.pending_revenue,
        ss.actual_seconds_played
      FROM stations s
      JOIN station_state ss ON ss.station_id = s.id
      ORDER BY s.id
    `);

    const stations = await Promise.all(rows.map(row => buildStationResponse(db, row)));
    res.json({ data: stations });
  } catch (err) {
    console.error('[GET /api/stations]', err);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stations/:id/start
// Body: { players: number, startTime: string (HH:MM), endTime: string (HH:MM) }
// ---------------------------------------------------------------------------
router.post('/:id/start', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { players, startTime, endTime } = req.body as {
    players:   number;
    startTime: string;
    endTime:   string;
  };

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (
    typeof players !== 'number' || players < 1 || players > 4 ||
    typeof startTime !== 'string' || !timeRe.test(startTime) ||
    typeof endTime   !== 'string' || !timeRe.test(endTime)
  ) {
    res.status(400).json({
      error: 'Invalid body. Required: players (1–4), startTime (HH:MM), endTime (HH:MM)',
    });
    return;
  }

  try {
    const db = await getDb();

    const station = await db.get<{ id: string; type: string }>(
      `SELECT s.id, s.type FROM stations s
       JOIN station_state ss ON ss.station_id = s.id
       WHERE s.id = ? AND ss.status = 'available'`,
      id
    );

    if (!station) {
      res.status(409).json({ error: `Station ${id} not found or not available` });
      return;
    }

    const { endsAt, durationSeconds, durationLabel } = computeSession(startTime, endTime);
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(
        `INSERT INTO sessions
           (id, station_id, players, duration_seconds, duration_label,
            start_time, end_time, ends_at, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in-progress', ?)`,
        sessionId, id, players, durationSeconds, durationLabel,
        startTime, endTime, endsAt, startedAt
      );

      await db.run(
        `UPDATE station_state
         SET status = 'busy', active_session_id = ?, pending_revenue = NULL, actual_seconds_played = NULL
         WHERE station_id = ?`,
        sessionId, id
      );

      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    res.status(201).json({
      data: {
        sessionId,
        stationId:       id,
        startedAt,
        players,
        startTime,
        endTime,
        endsAt,
        durationSeconds,
        durationLabel,
      },
    });
  } catch (err) {
    console.error(`[POST /api/stations/${id}/start]`, err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stations/:id/end
// Marks the session as completed; calculates revenue from booked duration.
// ---------------------------------------------------------------------------
router.post('/:id/end', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const db = await getDb();

    const stateRow = await db.get<StationRow>(
      `SELECT ss.*, s.type FROM station_state ss
       JOIN stations s ON s.id = ss.station_id
       WHERE ss.station_id = ? AND ss.status = 'busy'`,
      id
    );

    if (!stateRow) {
      res.status(409).json({ error: `Station ${id} has no active session` });
      return;
    }

    const session = await db.get<SessionRow>(
      `SELECT * FROM sessions WHERE id = ?`,
      stateRow.active_session_id
    );

    if (!session) {
      res.status(500).json({ error: 'Session record missing — data inconsistency' });
      return;
    }

    // actual_seconds_played: how long the session actually ran (wall-clock)
    // Revenue is based on actual time — players may leave before the booked end
    const actualSeconds = elapsedSeconds(session.started_at);
    const revenue       = await calculateRevenue(
      db,
      stateRow.type,
      session.players,
      actualSeconds
    );

    const endedAt = new Date().toISOString();

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(
        `UPDATE sessions
         SET status = 'completed', ended_at = ?, actual_seconds_played = ?, revenue = ?
         WHERE id = ?`,
        endedAt, actualSeconds, revenue, session.id
      );

      await db.run(
        `UPDATE station_state
         SET status = 'completed', pending_revenue = ?, actual_seconds_played = ?
         WHERE station_id = ?`,
        revenue, actualSeconds, id
      );

      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    res.json({
      data: {
        stationId:           id,
        sessionId:           session.id,
        startTime:           session.start_time,
        endTime:             session.end_time,
        pendingRevenue:      revenue,
        actualSecondsPlayed: actualSeconds,
        endedAt,
      },
    });
  } catch (err) {
    console.error(`[POST /api/stations/${id}/end]`, err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stations/:id/terminate
// Body: { reason: string }
// ---------------------------------------------------------------------------
router.post('/:id/terminate', async (req: Request, res: Response) => {
  const { id }     = req.params;
  const { reason } = req.body as { reason?: string };

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    res.status(400).json({ error: 'Termination reason is required' });
    return;
  }

  try {
    const db = await getDb();

    const stateRow = await db.get<StationRow>(
      `SELECT ss.*, s.type FROM station_state ss
       JOIN stations s ON s.id = ss.station_id
       WHERE ss.station_id = ? AND ss.status IN ('busy', 'completed')`,
      id
    );

    if (!stateRow) {
      res.status(409).json({ error: `Station ${id} has no active or pending session` });
      return;
    }

    const session = await db.get<SessionRow>(
      `SELECT * FROM sessions WHERE id = ?`,
      stateRow.active_session_id
    );

    if (!session) {
      res.status(500).json({ error: 'Session record missing — data inconsistency' });
      return;
    }

    // For terminate: actual time played is elapsed wall-clock time
    const actualSeconds = elapsedSeconds(session.started_at);
    const endedAt       = new Date().toISOString();
    const durationStr   = formatDuration(actualSeconds);

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(
        `UPDATE sessions
         SET status = 'terminated', ended_at = ?, actual_seconds_played = ?,
             termination_reason = ?, revenue = 0
         WHERE id = ?`,
        endedAt, actualSeconds, reason.trim(), session.id
      );

      await db.run(
        `UPDATE station_state
         SET status = 'available', active_session_id = NULL,
             pending_revenue = NULL, actual_seconds_played = NULL
         WHERE station_id = ?`,
        id
      );

      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    res.json({
      data: {
        stationId:           id,
        sessionId:           session.id,
        status:              'terminated',
        startTime:           session.start_time,
        endTime:             session.end_time,
        terminationReason:   reason.trim(),
        actualSecondsPlayed: actualSeconds,
        duration:            durationStr,
        endedAt,
      },
    });
  } catch (err) {
    console.error(`[POST /api/stations/${id}/terminate]`, err);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stations/:id/collect
// ---------------------------------------------------------------------------
router.post('/:id/collect', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const db = await getDb();

    const stateRow = await db.get<StationRow>(
      `SELECT ss.*, s.type FROM station_state ss
       JOIN stations s ON s.id = ss.station_id
       WHERE ss.station_id = ? AND ss.status = 'completed'`,
      id
    );

    if (!stateRow) {
      res.status(409).json({ error: `Station ${id} has no pending collection` });
      return;
    }

    const session = await db.get<SessionRow>(
      `SELECT * FROM sessions WHERE id = ?`,
      stateRow.active_session_id
    );

    if (!session) {
      res.status(500).json({ error: 'Session record missing — data inconsistency' });
      return;
    }

    await db.run(
      `UPDATE station_state
       SET status = 'available', active_session_id = NULL,
           pending_revenue = NULL, actual_seconds_played = NULL
       WHERE station_id = ?`,
      id
    );

    const actualSeconds = stateRow.actual_seconds_played ?? 0;

    res.json({
      data: {
        stationId: id,
        sessionId: session.id,
        revenue:   stateRow.pending_revenue ?? 0,
        duration:  session.duration_label,   // "14:00 - 16:00"
        machineId: `${id} (${stateRow.type})`,
        type:      stateRow.type,
        status:    'completed',
        players:   session.players,
        date:      new Date().toISOString().split('T')[0],
        startTime: session.start_time,
        endTime:   session.end_time,
      },
    });
  } catch (err) {
    console.error(`[POST /api/stations/${id}/collect]`, err);
    res.status(500).json({ error: 'Failed to collect revenue' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stations/:id/extend
// Body: { minutes: number }
// ---------------------------------------------------------------------------
router.post('/:id/extend', async (req: Request, res: Response) => {
  const { id }      = req.params;
  const { minutes } = req.body as { minutes?: number };

  if (typeof minutes !== 'number' || minutes < 1 || minutes > 480) {
    res.status(400).json({ error: 'minutes must be a number between 1 and 480' });
    return;
  }

  try {
    const db = await getDb();

    const stateRow = await db.get<{ active_session_id: string }>(
      `SELECT ss.active_session_id FROM station_state ss
       WHERE ss.station_id = ? AND ss.status = 'busy'`,
      id
    );

    if (!stateRow) {
      res.status(409).json({ error: `Station ${id} has no active session` });
      return;
    }

    const session = await db.get<SessionRow>(
      `SELECT * FROM sessions WHERE id = ?`,
      stateRow.active_session_id
    );

    if (!session || !session.ends_at) {
      res.status(409).json({ error: 'Session has no scheduled end time to extend' });
      return;
    }

    const newEndsAt  = new Date(new Date(session.ends_at).getTime() + minutes * 60_000).toISOString();
    const newEndDate = new Date(newEndsAt);
    const newEndTime = `${String(newEndDate.getHours()).padStart(2,'0')}:${String(newEndDate.getMinutes()).padStart(2,'0')}`;

    const [sh, sm]  = (session.start_time ?? '00:00').split(':').map(Number);
    const [eh, em]  = newEndTime.split(':').map(Number);
    let newDurMins  = (eh * 60 + em) - (sh * 60 + sm);
    if (newDurMins <= 0) newDurMins += 24 * 60;
    const newDurationSeconds = newDurMins * 60;

    await db.run(
      `UPDATE sessions
       SET ends_at = ?, end_time = ?, duration_seconds = ?, duration_label = ?
       WHERE id = ?`,
      newEndsAt, newEndTime, newDurationSeconds,
      `${session.start_time} - ${newEndTime}`,
      session.id
    );

    const remaining = remainingSeconds(newEndsAt);

    res.json({
      data: {
        stationId:       id,
        endsAt:          newEndsAt,
        endTime:         newEndTime,
        remainingSeconds: remaining,
        remainingTime:   formatCountdown(remaining),
        durationSeconds: newDurationSeconds,
      },
    });
  } catch (err) {
    console.error(`[POST /api/stations/${id}/extend]`, err);
    res.status(500).json({ error: 'Failed to extend session' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stations
// Body: { id: string, type: string, pricingTemplate: 'PS5' | 'PS4' }
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response) => {
  const { id, type, pricingTemplate } = req.body as {
    id?: string;
    type?: string;
    pricingTemplate?: string;
  };

  if (!id || typeof id !== 'string' || !/^[A-Za-z0-9_\-]{2,20}$/.test(id.trim())) {
    res.status(400).json({ error: 'id must be 2–20 alphanumeric/dash/underscore characters' });
    return;
  }
  if (!type || typeof type !== 'string' || type.trim().length < 2) {
    res.status(400).json({ error: 'type is required (e.g. PS5, PS4, PC)' });
    return;
  }
  if (!pricingTemplate || !['PS5', 'PS4'].includes(pricingTemplate)) {
    res.status(400).json({ error: 'pricingTemplate must be PS5 or PS4' });
    return;
  }

  const stationId = id.trim().toUpperCase();
  const stationType = type.trim().toUpperCase();

  try {
    const db = await getDb();

    const existing = await db.get(`SELECT id FROM stations WHERE id = ?`, stationId);
    if (existing) {
      res.status(409).json({ error: `Station ${stationId} already exists` });
      return;
    }

    // Copy pricing from template if this type doesn't have pricing yet
    const hasPricing = await db.get(`SELECT id FROM pricing WHERE platform = ? LIMIT 1`, stationType);
    if (!hasPricing) {
      const templatePricing = await db.all<PricingRow[]>(
        `SELECT * FROM pricing WHERE platform = ?`, pricingTemplate
      );
      const insertP = await db.prepare(`
        INSERT OR IGNORE INTO pricing (platform, player_tier, price_thirty_min, price_one_hour, price_three_hour, price_five_hour)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const row of templatePricing) {
        await insertP.run(stationType, row.player_tier, row.price_thirty_min, row.price_one_hour, row.price_three_hour, row.price_five_hour);
      }
      await insertP.finalize();
    }

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(`INSERT INTO stations (id, type) VALUES (?, ?)`, stationId, stationType);
      await db.run(`INSERT INTO station_state (station_id, status) VALUES (?, 'available')`, stationId);
      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    // Return the new station in the same shape as GET /api/stations
    const stationRow = { id: stationId, type: stationType, status: 'available' as const, active_session_id: null, pending_revenue: null, actual_seconds_played: null };
    const stationResponse = await buildStationResponse(db, stationRow);

    res.status(201).json({ data: stationResponse });
  } catch (err) {
    console.error('[POST /api/stations]', err);
    res.status(500).json({ error: 'Failed to add station' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/stations/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const db = await getDb();

    const stateRow = await db.get<{ status: string }>(
      `SELECT status FROM station_state WHERE station_id = ?`, id
    );

    if (!stateRow) {
      res.status(404).json({ error: `Station ${id} not found` });
      return;
    }
    if (stateRow.status !== 'available') {
      res.status(409).json({ error: `Station ${id} has an active or pending session — end it first` });
      return;
    }

    await db.run('BEGIN TRANSACTION');
    try {
      await db.run(`DELETE FROM station_state WHERE station_id = ?`, id);
      await db.run(`DELETE FROM stations WHERE id = ?`, id);
      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    res.json({ data: { stationId: id, deleted: true } });
  } catch (err) {
    console.error(`[DELETE /api/stations/${id}]`, err);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

export default router;
