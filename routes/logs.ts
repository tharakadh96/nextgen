/**
 * routes/logs.ts — Session log and reporting endpoints.
 *
 * GET /api/logs?date=YYYY-MM-DD               — session logs for a date
 * GET /api/reports/daily?date=YYYY-MM-DD       — revenue summary + hourly breakdown
 *
 * Date filtering uses the started_at column (stored as ISO-8601 UTC text).
 * We match on the date portion: WHERE date(started_at) = ?
 *
 * The frontend's SessionLog shape uses machineId formatted as "PS5-01 (PS5)".
 * We reconstruct that here so the API output is drop-in compatible.
 */

import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionRow {
  id:                   string;
  station_id:           string | null;
  station_type:         string | null;
  players:              number;
  duration_label:       string;
  revenue:              number;
  status:               'completed' | 'in-progress' | 'terminated';
  termination_reason:   string | null;
  started_at:           string;
  ended_at:             string | null;
  actual_seconds_played: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatPlayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function toSessionLog(row: SessionRow) {
  let actualDuration = row.duration_label;
  if (row.ended_at) {
    const playSeconds = row.actual_seconds_played != null
      ? row.actual_seconds_played
      : Math.max(0, Math.floor((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000));
    actualDuration = `${toHHMM(row.started_at)} - ${toHHMM(row.ended_at)} (${formatPlayTime(playSeconds)})`;
  }

  const stationType = row.station_type ?? 'Unknown';
  const machineId   = row.station_id
    ? `${row.station_id} (${stationType})`
    : `[Deleted] (${stationType})`;

  return {
    id:                row.id,
    machineId,
    type:              stationType,
    status:            row.status,
    players:           row.players,
    duration:          actualDuration,
    revenue:           row.revenue,
    date:              new Date(row.started_at).toLocaleDateString('en-CA'),
    terminationReason: row.termination_reason ?? undefined,
  };
}

function validateDate(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return dateStr;
}

// ---------------------------------------------------------------------------
// GET /api/logs?date=YYYY-MM-DD
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  const date = validateDate(req.query['date']);
  if (!date) {
    res.status(400).json({ error: 'date query param is required in YYYY-MM-DD format' });
    return;
  }

  try {
    const db = await getDb();

    const rows = await db.all<SessionRow[]>(
      `SELECT
         ses.id,
         ses.station_id,
         COALESCE(s.type, ses.station_type) AS station_type,
         ses.players,
         ses.duration_label,
         ses.revenue,
         ses.status,
         ses.termination_reason,
         ses.started_at,
         ses.ended_at,
         ses.actual_seconds_played
       FROM sessions ses
       LEFT JOIN stations s ON s.id = ses.station_id
       WHERE date(ses.started_at, '+5 hours', '+30 minutes') = ?
       ORDER BY ses.started_at DESC`,
      date
    );

    res.json({ data: rows.map(toSessionLog) });
  } catch (err) {
    console.error('[GET /api/logs]', err);
    res.status(500).json({ error: 'Failed to fetch session logs' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/logs/range?from=YYYY-MM-DD&to=YYYY-MM-DD
// ---------------------------------------------------------------------------
router.get('/range', async (req: Request, res: Response) => {
  const from = validateDate(req.query['from']);
  const to   = validateDate(req.query['to']);
  if (!from || !to) {
    res.status(400).json({ error: 'from and to query params are required in YYYY-MM-DD format' });
    return;
  }
  if (from > to) {
    res.status(400).json({ error: 'from date must be on or before to date' });
    return;
  }

  try {
    const db = await getDb();
    const rows = await db.all<SessionRow[]>(
      `SELECT
         ses.id,
         ses.station_id,
         COALESCE(s.type, ses.station_type) AS station_type,
         ses.players,
         ses.duration_label,
         ses.revenue,
         ses.status,
         ses.termination_reason,
         ses.started_at,
         ses.ended_at,
         ses.actual_seconds_played
       FROM sessions ses
       LEFT JOIN stations s ON s.id = ses.station_id
       WHERE date(ses.started_at, '+5 hours', '+30 minutes') BETWEEN ? AND ?
       ORDER BY ses.started_at ASC`,
      from, to
    );

    const logs        = rows.map(toSessionLog);
    const totalRevenue = logs.reduce((sum, l) => sum + l.revenue, 0);
    res.json({ data: logs, totalRevenue, from, to });
  } catch (err) {
    console.error('[GET /api/logs/range]', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reports/daily?date=YYYY-MM-DD
//
// Returns:
// {
//   date: string,
//   totalRevenue: number,
//   sessionCount: number,
//   ps5Revenue: number,
//   ps4Revenue: number,
//   ps5Sessions: number,
//   ps4Sessions: number,
//   hourlyBreakdown: Array<{ time: string, value: number }>,
//   platformMix: { ps5Percent: number, ps4Percent: number }
// }
// ---------------------------------------------------------------------------
router.get('/daily', async (req: Request, res: Response) => {
  const date = validateDate(req.query['date']);
  if (!date) {
    res.status(400).json({ error: 'date query param is required in YYYY-MM-DD format' });
    return;
  }

  try {
    const db = await getDb();

    // Summary stats — only completed sessions generate revenue
    const summary = await db.get<{
      total_revenue:  number;
      session_count:  number;
      ps5_revenue:    number;
      ps4_revenue:    number;
      ps5_sessions:   number;
      ps4_sessions:   number;
    }>(
      `SELECT
         COALESCE(SUM(ses.revenue), 0) AS total_revenue,
         COUNT(*)                       AS session_count,
         COALESCE(SUM(CASE WHEN COALESCE(s.type, ses.station_type) = 'PS5' THEN ses.revenue ELSE 0 END), 0) AS ps5_revenue,
         COALESCE(SUM(CASE WHEN COALESCE(s.type, ses.station_type) = 'PS4' THEN ses.revenue ELSE 0 END), 0) AS ps4_revenue,
         COUNT(CASE WHEN COALESCE(s.type, ses.station_type) = 'PS5' THEN 1 END) AS ps5_sessions,
         COUNT(CASE WHEN COALESCE(s.type, ses.station_type) = 'PS4' THEN 1 END) AS ps4_sessions
       FROM sessions ses
       LEFT JOIN stations s ON s.id = ses.station_id
       WHERE date(ses.started_at, '+5 hours', '+30 minutes') = ?
         AND ses.status = 'completed'`,
      date
    );

    // Hourly revenue breakdown — grouped by hour of day
    const hourlyRows = await db.all<{ hour: number; revenue: number }[]>(
      `SELECT
         CAST(strftime('%H', ses.started_at, '+5 hours', '+30 minutes') AS INTEGER) AS hour,
         COALESCE(SUM(ses.revenue), 0)                   AS revenue
       FROM sessions ses
       LEFT JOIN stations s ON s.id = ses.station_id
       WHERE date(ses.started_at, '+5 hours', '+30 minutes') = ?
         AND ses.status = 'completed'
       GROUP BY hour
       ORDER BY hour`,
      date
    );

    // Build a full 24-hour array (missing hours have value 0)
    const hourlyMap = new Map<number, number>(
      hourlyRows.map(r => [r.hour, r.revenue])
    );
    const hourlyBreakdown = Array.from({ length: 24 }, (_, i) => ({
      time:  `${String(i).padStart(2, '0')}:00`,
      value: hourlyMap.get(i) ?? 0,
    }));

    const totalRevenue = summary?.total_revenue ?? 0;
    const ps5Revenue   = summary?.ps5_revenue   ?? 0;
    const ps4Revenue   = summary?.ps4_revenue   ?? 0;

    const ps5Percent = totalRevenue > 0
      ? Math.round((ps5Revenue / totalRevenue) * 100)
      : 0;
    const ps4Percent = totalRevenue > 0 ? 100 - ps5Percent : 0;

    res.json({
      data: {
        date,
        totalRevenue,
        sessionCount:     summary?.session_count ?? 0,
        ps5Revenue,
        ps4Revenue,
        ps5Sessions:      summary?.ps5_sessions  ?? 0,
        ps4Sessions:      summary?.ps4_sessions  ?? 0,
        hourlyBreakdown,
        platformMix:      { ps5Percent, ps4Percent },
      },
    });
  } catch (err) {
    console.error('[GET /api/reports/daily]', err);
    res.status(500).json({ error: 'Failed to generate daily report' });
  }
});

export default router;
