/**
 * routes/pricing.ts — Pricing configuration endpoints.
 *
 * GET /api/pricing         — returns full pricing matrix (public)
 * PUT /api/pricing         — update pricing (admin only)
 *
 * Pricing is returned in the same nested shape the frontend uses:
 * {
 *   ps5Rates: { single: { hourly, thirtyMin, threeHour, fiveHour }, … },
 *   ps4Rates: { … },
 *   minDurationPrice: number
 * }
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

    const minPriceSetting = await db.get<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'min_duration_price'`
    );

    res.json({
      data: {
        ps5Rates:        rowsToPlatformRates(rows, 'PS5'),
        ps4Rates:        rowsToPlatformRates(rows, 'PS4'),
        minDurationPrice: minPriceSetting ? parseInt(minPriceSetting.value, 10) : 30,
      },
    });
  } catch (err) {
    console.error('[GET /api/pricing]', err);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/pricing  (admin only)
// Body: { ps5Rates: PlatformRates, ps4Rates: PlatformRates, minDurationPrice?: number }
// ---------------------------------------------------------------------------
router.put('/', requireAdmin, async (req: Request, res: Response) => {
  const { ps5Rates, ps4Rates, minDurationPrice } = req.body as {
    ps5Rates:         PlatformRates;
    ps4Rates:         PlatformRates;
    minDurationPrice?: number;
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
        const val = (rates[tier] as Record<string, unknown>)[field];
        if (typeof val !== 'number' || val < 0 || !Number.isInteger(val)) {
          res.status(400).json({
            error: `${label}.${tier}.${field} must be a non-negative integer`,
          });
          return;
        }
      }
    }
  }

  if (minDurationPrice !== undefined) {
    if (typeof minDurationPrice !== 'number' || minDurationPrice < 0 || !Number.isInteger(minDurationPrice)) {
      res.status(400).json({ error: 'minDurationPrice must be a non-negative integer' });
      return;
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

      if (minDurationPrice !== undefined) {
        await db.run(
          `UPDATE settings SET value = ? WHERE key = 'min_duration_price'`,
          String(minDurationPrice)
        );
      }

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

export default router;
