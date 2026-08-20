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
 * They were rewritten ONCE, on 2026-08-20, and only because the pitch maths
 * changed on purpose: a Madhyam label was found to name its Ma rather than its
 * Sa, so Sa moved a fourth for every Madhyam pitch (lib/pitch.ts,
 * NOTE_ABOVE_SA). Sailavan asked for that after hearing the drone.
 *
 * What did NOT change is the part this gate exists to protect: all eleven
 * singers, and all eleven sample counts, are exactly as before — the same rows
 * still qualify. Only the offsets moved, and only because 52 of 669
 * comparisons put a Madhyam label against a Pancham one. The means widened,
 * which is the cost recorded against NOTE_ABOVE_SA; if that constant is ever
 * put back to 0, these numbers go back to their previous values, which are in
 * git history at 2b40a4d.
 *
 * The offsets are measured against SessionSlot.historicalRecommendedPitch —
 * the recommendation as recorded in the source sheet — not against a masterlist
 * lookup. The two agree on value (617 of 618 rows) but disagree on which rows
 * qualify, and this table is defined on the former. See PROGRESS.md.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { semitoneDelta, median, mean } from '../lib/pitch';

/**
 * Straight from the table in CLAUDE.md: [gender, n, median, mean].
 *
 * Means are quoted to two decimals, except Ashwin and Pavitra, whose means land
 * exactly on the 2-decimal rounding boundary (0.625, 0.375). The comparison
 * below allows a difference of under 0.005, which a value sitting exactly on
 * 0.005 fails either way it is rounded, so those two are given in full.
 */
const EXPECTED = {
  Sailavan: ['Gents', 99, 1, 0.9],
  Ashwin: ['Gents', 96, 0, 0.625],
  Prithvi: ['Gents', 89, 1, 1.63],
  Jothsna: ['Ladies', 69, 0, 0.43],
  Prasanna: ['Ladies', 63, 1, 0.9],
  Pavitra: ['Ladies', 40, 0, 0.375],
  Shravya: ['Ladies', 40, 1, 1.18],
  Sriraag: ['Gents', 39, 0, 0.21],
  Rhuben: ['Gents', 35, 0, 0.14],
  Anvita: ['Ladies', 25, 0, -0.32],
  Triveni: ['Ladies', 16, 0, -0.5],
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
