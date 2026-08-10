/**
 * THE PHASE 0 GATE.
 *
 * The singer offset table in CLAUDE.md must reproduce exactly from the seeded
 * database. Eleven singers, with their n, median and mean.
 *
 * The expected values below are copied verbatim from CLAUDE.md and are NOT to
 * be adjusted to make this pass. If this test fails, the seed or the pitch
 * maths is wrong — fix that, or stop and report it. Changing these numbers
 * destroys the only check that the import preserved the group's real history.
 *
 * The offsets are measured against SessionSlot.historicalRecommendedPitch —
 * the recommendation as recorded in the source sheet — not against a masterlist
 * lookup. The two agree on value (617 of 618 rows) but disagree on which rows
 * qualify, and this table is defined on the former. See PROGRESS.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { semitoneDelta, median, mean } from '../lib/pitch';

/** Straight from the table in CLAUDE.md: [gender, n, median, mean]. */
const EXPECTED = {
  Sailavan: ['Gents', 99, 1, 0.85],
  Ashwin: ['Gents', 96, 0, 0.31],
  Prithvi: ['Gents', 89, 1, 1.35],
  Jothsna: ['Ladies', 69, 0, 0.42],
  Prasanna: ['Ladies', 63, 1, 1.05],
  Pavitra: ['Ladies', 40, 0, 0.25],
  Shravya: ['Ladies', 40, 0, 0.55],
  Sriraag: ['Gents', 39, 0, -0.23],
  Rhuben: ['Gents', 35, 0, 0.0],
  Anvita: ['Ladies', 25, 0, -0.52],
  Triveni: ['Ladies', 16, 0, 0.25],
} as const satisfies Record<string, readonly [string, number, number, number]>;

const EXPECTED_TOTAL = Object.values(EXPECTED).reduce((sum, [, n]) => sum + n, 0);

const hasDatabase = Boolean(process.env.DATABASE_URL);

const prisma = hasDatabase ? new PrismaClient() : null;

type Profile = { gender: string | null; deltas: number[] };
let profiles = new Map<string, Profile>();

describe.skipIf(!hasDatabase)('singer offset profiles reproduce from the seeded database', () => {
  beforeAll(async () => {
    const slots = await prisma!.sessionSlot.findMany({
      where: {
        confirmedPitch: { not: null },
        historicalRecommendedPitch: { not: null },
        // singerId became nullable when the session builder needed to draft
        // slots before rostering. Every historical row has a singer; this
        // narrows the type and keeps the gate measuring only real history.
        singerId: { not: null },
      },
      select: {
        confirmedPitch: true,
        historicalRecommendedPitch: true,
        singer: { select: { name: true, gender: true } },
      },
    });

    profiles = new Map();
    for (const slot of slots) {
      const delta = semitoneDelta(slot.confirmedPitch, slot.historicalRecommendedPitch);
      if (delta === null) continue;
      if (!slot.singer) continue;
      const name = slot.singer.name;
      if (!profiles.has(name)) {
        profiles.set(name, { gender: slot.singer.gender, deltas: [] });
      }
      profiles.get(name)!.deltas.push(delta);
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('finds exactly the eleven singers from the table', () => {
    expect([...profiles.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it(`covers exactly ${EXPECTED_TOTAL} rows in total`, () => {
    const total = [...profiles.values()].reduce((sum, p) => sum + p.deltas.length, 0);
    expect(total).toBe(EXPECTED_TOTAL);
  });

  it('has no singer name needing trimming (the "Prithvi " row was normalised)', () => {
    for (const name of profiles.keys()) {
      expect(name).toBe(name.trim().replace(/\s+/g, ' '));
    }
  });

  for (const [singer, [gender, n, expectedMedian, expectedMean]] of Object.entries(EXPECTED)) {
    it(`${singer} (${gender}): n=${n}, median=${expectedMedian}, mean=${expectedMean}`, () => {
      const profile = profiles.get(singer);
      expect(profile, `${singer} is missing from the seeded data`).toBeDefined();
      expect(profile!.gender, `${singer} gender`).toBe(gender);
      expect(profile!.deltas.length, `${singer} sample count`).toBe(n);
      expect(median(profile!.deltas), `${singer} median offset`).toBe(expectedMedian);
      // CLAUDE.md quotes means to two decimal places.
      expect(mean(profile!.deltas), `${singer} mean offset`).toBeCloseTo(expectedMean, 2);
    });
  }
});

describe.skipIf(hasDatabase)('singer offset regression', () => {
  it('SKIPPED — no DATABASE_URL, so the database-backed gate did not run', () => {
    console.warn(
      '\n  ⚠ tests/singerOffsets.test.ts was skipped: no DATABASE_URL in the environment.\n' +
      '    This is the Phase 0 gate. It must pass against the real database before\n' +
      '    Phase 0 can be called done. Run it locally from an IP allowlisted on the\n' +
      '    Azure Postgres firewall.\n',
    );
    expect(hasDatabase).toBe(false);
  });
});
