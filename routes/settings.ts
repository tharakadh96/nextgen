/**
 * routes/settings.ts — Application settings + admin PIN verification.
 *
 * POST /api/admin/verify-pin    — verify PIN, return JWT token
 * GET  /api/settings            — get all settings (public)
 * PUT  /api/settings            — update settings (admin only)
 *
 * Settings exposed to the client:
 *   auto_end_sessions  — boolean (string 'true'/'false' in DB)
 *   min_duration_price — integer
 *
 * admin_pin is intentionally excluded from GET /api/settings output.
 */

import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/database.js';
import { verifyPinAndSign, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/admin/verify-pin
// Body: { pin: string }
// ---------------------------------------------------------------------------
router.post('/admin/verify-pin', async (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };

  if (!pin || typeof pin !== 'string') {
    res.status(400).json({ error: 'pin is required' });
    return;
  }

  // Basic sanitization — PIN should only be digits
  if (!/^\d+$/.test(pin)) {
    res.status(400).json({ error: 'Invalid PIN format' });
    return;
  }

  try {
    const token = await verifyPinAndSign(pin);

    if (!token) {
      // Use 401 + generic message — don't hint whether user/pin was wrong
      res.status(401).json({ success: false, error: 'Incorrect PIN' });
      return;
    }

    res.json({ success: true, token });
  } catch (err) {
    console.error('[POST /api/admin/verify-pin]', err);
    res.status(500).json({ error: 'Authentication error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/settings
// Returns all non-sensitive settings.
// ---------------------------------------------------------------------------
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const db   = await getDb();
    const rows = await db.all<{ key: string; value: string }[]>(
      `SELECT key, value FROM settings WHERE key != 'admin_pin'`
    );

    // Deserialize values to their native types
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      if (row.key === 'auto_end_sessions') {
        settings[row.key] = row.value === 'true';
      } else if (row.key === 'min_duration_price') {
        settings[row.key] = parseInt(row.value, 10);
      } else {
        settings[row.key] = row.value;
      }
    }

    res.json({ data: settings });
  } catch (err) {
    console.error('[GET /api/settings]', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/settings  (admin only)
// Body: { auto_end_sessions?: boolean, admin_pin?: string, min_duration_price?: number }
// ---------------------------------------------------------------------------
router.put('/settings', requireAdmin, async (req: Request, res: Response) => {
  const { auto_end_sessions, admin_pin, min_duration_price } = req.body as {
    auto_end_sessions?: boolean;
    admin_pin?:         string;
    min_duration_price?: number;
  };

  const updates: { key: string; value: string }[] = [];

  if (auto_end_sessions !== undefined) {
    if (typeof auto_end_sessions !== 'boolean') {
      res.status(400).json({ error: 'auto_end_sessions must be a boolean' });
      return;
    }
    updates.push({ key: 'auto_end_sessions', value: String(auto_end_sessions) });
  }

  if (min_duration_price !== undefined) {
    if (
      typeof min_duration_price !== 'number' ||
      !Number.isInteger(min_duration_price) ||
      min_duration_price < 0
    ) {
      res.status(400).json({ error: 'min_duration_price must be a non-negative integer' });
      return;
    }
    updates.push({ key: 'min_duration_price', value: String(min_duration_price) });
  }

  if (admin_pin !== undefined) {
    if (typeof admin_pin !== 'string' || !/^\d{4}$/.test(admin_pin)) {
      res.status(400).json({ error: 'admin_pin must be a 4-digit numeric string' });
      return;
    }
    updates.push({ key: 'admin_pin', value: admin_pin });
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No valid settings fields provided' });
    return;
  }

  try {
    const db = await getDb();
    const stmt = await db.prepare(
      `UPDATE settings SET value = ? WHERE key = ?`
    );

    for (const { key, value } of updates) {
      await stmt.run(value, key);
    }

    await stmt.finalize();

    res.json({ data: { message: 'Settings updated successfully', updated: updates.map(u => u.key) } });
  } catch (err) {
    console.error('[PUT /api/settings]', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
