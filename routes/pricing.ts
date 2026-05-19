/**
 * routes/pricing.ts — Pricing configuration endpoints.
 *
 * GET /api/pricing         — returns full pricing matrix (public)
 * PUT /api/pricing         — update pricing (admin only)
 */

import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/database.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface PricingRow {
  platform:         string;
  player_tier:      string;
  price_thirty_min: number;
  price_one_hour:   number;
  price_three_hour: number;
  price_five_hour:  number;
}

interface TierRates {
  hourly:    number;
  thirtyMin: number;
  threeHour: number;
  fiveHour:  number;
}

interface PlatformRates {
  single: TierRates;
  duo:    TierRates;
  trio:   TierRates;
  squad:  TierRates;
}

// ---------------------------------------------------------------------------
// Helper: rows → nested object
// ---------------------------------------------------------------------------
function rowsToPlatformRates(
  rows: PricingRow[],
  platform: string
): PlatformRates {
  const result: Partial<PlatformRates> = {};

  for (const row of rows.filter(r => r.platform === platform)) {
    result[row.player_tier as keyof PlatformRates] = {
      hourly:    row.price_one_hour,
      thirtyMin: row.price_thirty_min,
      threeHour: row.price_three_hour,
      fiveHour:  row.price_five_hour,
    };
  }

  return result as PlatformRates;
}

// ---------------------------------------------------------------------------
// GET /api/pricing
// ---------------------------------------------------------------------------
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db   = await getDb();
    const rows = await db.all<PricingRow[]>('SELECT * FROM pricing ORDER BY platform, player_tier');

    const slotRows = await db.all<{ platform: string; player_tier: string; duration_minutes: number; price: number }[]>(
      'SELECT platform, player_tier, duration_minutes, price FROM pricing_slots ORDER BY platform, player_tier, duration_minutes'
    );

    const slots: Record<string, Record<string, Record<number, number>>> = {};
    for (const s of slotRows) {
      if (!slots[s.platform]) slots[s.platform] = {};
      if (!slots[s.platform][s.player_tier]) slots[s.platform][s.player_tier] = {};
      slots[s.platform][s.player_tier][s.duration_minutes] = s.price;
    }

    res.json({
      data: {
        ps5Rates: rowsToPlatformRates(rows, 'PS5'),
        ps4Rates: rowsToPlatformRates(rows, 'PS4'),
        slots,
      },
    });
  } catch (err) {
    console.error('[GET /api/pricing]', err);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/pricing  (admin only)
// Body: { ps5Rates: PlatformRates, ps4Rates: PlatformRates }
// ---------------------------------------------------------------------------
router.put('/', requireAdmin, async (req: Request, res: Response) => {
  const { ps5Rates, ps4Rates } = req.body as {
    ps5Rates: PlatformRates;
    ps4Rates: PlatformRates;
  };

  // Validate structure
  const TIERS: (keyof PlatformRates)[] = ['single', 'duo', 'trio', 'squad'];
  const RATE_FIELDS: (keyof TierRates)[] = ['hourly', 'thirtyMin', 'threeHour', 'fiveHour'];

  for (const [label, rates] of [['ps5Rates', ps5Rates], ['ps4Rates', ps4Rates]] as const) {
    if (!rates || typeof rates !== 'object') {
      res.status(400).json({ error: `${label} is required and must be an object` });
      return;
    }
    for (const tier of TIERS) {
      if (!rates[tier] || typeof rates[tier] !== 'object') {
        res.status(400).json({ error: `${label}.${tier} is required` });
        return;
      }
      for (const field of RATE_FIELDS) {
        const val = (rates[tier] as unknown as Record<string, unknown>)[field];
        if (typeof val !== 'number' || val < 0 || !Number.isInteger(val)) {
          res.status(400).json({
            error: `${label}.${tier}.${field} must be a non-negative integer`,
          });
          return;
        }
      }
    }
  }

  try {
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');
    try {
      const update = await db.prepare(`
        UPDATE pricing
        SET price_thirty_min = ?,
            price_one_hour   = ?,
            price_three_hour = ?,
            price_five_hour  = ?
        WHERE platform = ? AND player_tier = ?
      `);

      for (const [platform, rates] of [['PS5', ps5Rates], ['PS4', ps4Rates]] as const) {
        for (const tier of TIERS) {
          const r = rates[tier];
          await update.run(
            r.thirtyMin,
            r.hourly,
            r.threeHour,
            r.fiveHour,
            platform,
            tier
          );
        }
      }

      await update.finalize();

      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }

    res.json({ data: { message: 'Pricing updated successfully' } });
  } catch (err) {
    console.error('[PUT /api/pricing]', err);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/pricing/slots  (admin only)
// ---------------------------------------------------------------------------
router.put('/slots', requireAdmin, async (req: Request, res: Response) => {
  const { slots } = req.body as {
    slots: Record<string, Record<string, Record<number, number>>>;
  };

  if (!slots || typeof slots !== 'object') {
    res.status(400).json({ error: 'slots object is required' });
    return;
  }

  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');
    try {
      for (const platform of Object.keys(slots)) {
        for (const tier of Object.keys(slots[platform])) {
          for (const [durStr, price] of Object.entries(slots[platform][tier])) {
            const dur = Number(durStr);
            if (!Number.isInteger(dur) || dur <= 0 || typeof price !== 'number' || price < 0) continue;
            await db.run(
              `INSERT INTO pricing_slots (platform, player_tier, duration_minutes, price)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(platform, player_tier, duration_minutes) DO UPDATE SET price = excluded.price`,
              platform, tier, dur, price
            );
          }
        }
      }
      await db.run('COMMIT');
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }
    res.json({ data: { message: 'Slot pricing updated successfully' } });
  } catch (err) {
    console.error('[PUT /api/pricing/slots]', err);
    res.status(500).json({ error: 'Failed to update slot pricing' });
  }
});

export default router;
