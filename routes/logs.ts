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
  station_id:           string;
  station_type:         'PS5' | 'PS4';
  players:              number;
  duration_label:       string;
  revenue:              number;
  status:               'completed' | 'in-progress' | 'terminated';
  termination_reason:   string | null;
  started_at:           string;
  actual_seconds_played: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSessionLog(row: SessionRow) {
  return {
    id:                row.id,
    machineId:         `${row.station_id} (${row.station_type})`,
    type:              row.station_type,
    status:            row.status,
    players:           row.players,
    duration:          row.duration_label,
    revenue:           row.revenue,
    date:              row.started_at.split('T')[0],
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
         s.type  AS station_type,
         ses.players,
         ses.duration_label,
         ses.revenue,
         ses.status,
         ses.termination_reason,
         ses.started_at,
         ses.actual_seconds_played
       FROM sessions ses
       JOIN stations s ON s.id = ses.station_id
       WHERE date(ses.started_at) = ?
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
         COALESCE(SUM(ses.revenue), 0)                         AS total_revenue,
         COUNT(*)                                               AS session_count,
         COALESCE(SUM(CASE WHEN s.type = 'PS5' THEN ses.revenue ELSE 0 END), 0) AS ps5_revenue,
         COALESCE(SUM(CASE WHEN s.type = 'PS4' THEN ses.revenue ELSE 0 END), 0) AS ps4_revenue,
         COUNT(CASE WHEN s.type = 'PS5' THEN 1 END)            AS ps5_sessions,
         COUNT(CASE WHEN s.type = 'PS4' THEN 1 END)            AS ps4_sessions
       FROM sessions ses
       JOIN stations s ON s.id = ses.station_id
       WHERE date(ses.started_at) = ?
         AND ses.status = 'completed'`,
      date
    );

    // Hourly revenue breakdown — grouped by hour of day
    const hourlyRows = await db.all<{ hour: number; revenue: number }[]>(
      `SELECT
         CAST(strftime('%H', ses.started_at) AS INTEGER) AS hour,
         COALESCE(SUM(ses.revenue), 0)                   AS revenue
       FROM sessions ses
       WHERE date(ses.started_at) = ?
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
