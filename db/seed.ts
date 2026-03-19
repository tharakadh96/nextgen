/**
 * seed.ts — Inserts default stations and pricing if the tables are empty.
 *
 * Called once during server startup via initializeDb().
 * All writes are wrapped in a single transaction so a partial seed
 * (e.g. power cut mid-run) leaves the DB clean and will retry on next start.
 */

import { type Database } from 'sqlite';

// ---------------------------------------------------------------------------
// Station definitions
// ---------------------------------------------------------------------------
const STATIONS = [
  { id: 'PS5-01', type: 'PS5' },
  { id: 'PS5-02', type: 'PS5' },
  { id: 'PS5-03', type: 'PS5' },
  { id: 'PS5-04', type: 'PS5' },
  { id: 'PS4-01', type: 'PS4' },
  { id: 'PS4-02', type: 'PS4' },
  { id: 'PS4-03', type: 'PS4' },
  { id: 'PS4-04', type: 'PS4' },
] as const;

// ---------------------------------------------------------------------------
// Default pricing (whole Philippine Pesos)
// Matches the brief exactly.
// ---------------------------------------------------------------------------
interface TierPricing {
  thirtyMin: number;
  oneHour:   number;
  threeHour: number;
  fiveHour:  number;
}

interface PlatformPricing {
  single: TierPricing;
  duo:    TierPricing;
  trio:   TierPricing;
  squad:  TierPricing;
}

const DEFAULT_PRICING: Record<'PS5' | 'PS4', PlatformPricing> = {
  PS5: {
    single: { thirtyMin:  40, oneHour:  70, threeHour: 190, fiveHour: 280 },
    duo:    { thirtyMin:  60, oneHour: 100, threeHour: 270, fiveHour: 440 },
    trio:   { thirtyMin:  75, oneHour: 130, threeHour: 340, fiveHour: 540 },
    squad:  { thirtyMin:  90, oneHour: 160, threeHour: 410, fiveHour: 640 },
  },
  PS4: {
    single: { thirtyMin:  30, oneHour:  55, threeHour: 150, fiveHour: 230 },
    duo:    { thirtyMin:  50, oneHour:  85, threeHour: 225, fiveHour: 360 },
    trio:   { thirtyMin:  65, oneHour: 110, threeHour: 285, fiveHour: 460 },
    squad:  { thirtyMin:  75, oneHour: 135, threeHour: 345, fiveHour: 560 },
  },
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function seedDatabase(db: Database): Promise<void> {
  // Check if stations have already been seeded.
  const stationCount = await db.get<{ c: number }>(
    'SELECT COUNT(*) AS c FROM stations'
  );
  if (stationCount && stationCount.c > 0) {
    console.log('[seed] Already seeded — skipping.');
    return;
  }

  console.log('[seed] Seeding stations and default pricing…');

  await db.run('BEGIN TRANSACTION');
  try {
    // -- Stations + initial station_state --------------------------------
    const insertStation = await db.prepare(
      'INSERT INTO stations (id, type) VALUES (?, ?)'
    );
    const insertState = await db.prepare(
      'INSERT INTO station_state (station_id, status) VALUES (?, ?)'
    );

    for (const station of STATIONS) {
      await insertStation.run(station.id, station.type);
      await insertState.run(station.id, 'available');
    }

    await insertStation.finalize();
    await insertState.finalize();

    // -- Pricing ---------------------------------------------------------
    const insertPricing = await db.prepare(`
      INSERT INTO pricing
        (platform, player_tier, price_thirty_min, price_one_hour, price_three_hour, price_five_hour)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const [platform, tiers] of Object.entries(DEFAULT_PRICING) as [
      'PS5' | 'PS4',
      PlatformPricing
    ][]) {
      for (const [tier, prices] of Object.entries(tiers) as [
        keyof PlatformPricing,
        TierPricing
      ][]) {
        await insertPricing.run(
          platform,
          tier,
          prices.thirtyMin,
          prices.oneHour,
          prices.threeHour,
          prices.fiveHour
        );
      }
    }

    await insertPricing.finalize();

    await db.run('COMMIT');
    console.log('[seed] Done.');
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}
