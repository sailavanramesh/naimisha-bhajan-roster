/**
 * Fake availability for DEV, so the board and the assign panel have something
 * to show.
 *
 * Usage:
 *   DATABASE_URL=<dev url> node scripts/seedFakeAvailability.mjs
 *   DATABASE_URL=<dev url> node scripts/seedFakeAvailability.mjs --clear
 *
 * ## The guard, and why it is not optional
 *
 * Prisma Client loads `.env` on its own, and this repository's `.env` is the
 * PRODUCTION database. A script like this run without thinking would invent
 * absences for real people on the live roster, and one of these rows is cycle
 * data. So it refuses to run against anything whose database is not named
 * `naimisha_dev`, and says so rather than failing quietly.
 *
 * The data is deliberately uneven — a long trip, scattered single nights, a
 * quiet stretch, three people with nothing at all — because a board where
 * everybody is away on everything tells you nothing about whether the board
 * works.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
const dbName = /\/([A-Za-z0-9_]+)(\?|$)/.exec(url)?.[1] ?? "(unknown)";
if (dbName !== "naimisha_dev") {
  console.error(`Refusing to run: DATABASE_URL points at "${dbName}", not naimisha_dev.`);
  console.error("This writes invented absences, including cycle data, against real names.");
  process.exit(1);
}

const clear = process.argv.includes("--clear");
const prisma = new PrismaClient();
const d = (iso) => new Date(`${iso}T00:00:00.000Z`);

const addDays = (iso, n) => {
  const t = new Date(`${iso}T12:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const range = (from, to) => {
  const out = [];
  for (let x = from; x <= to; x = addDays(x, 1)) out.push(x);
  return out;
};

/**
 * Who is away, and why in real life — the reason is never shown to a rosterer.
 *
 * Some of these land on 2026-08-27 and 2026-09-04 ON PURPOSE: those are the
 * sessions that actually exist in the dev diary, and the assign panel can only
 * dim somebody on a session that is there to open. The heaviest night,
 * 2026-09-10, has no session yet, which is its own thing worth seeing on the
 * board — four away on a Thursday nobody has built.
 */
const PLAN = [
  { name: "Prithvi", note: "overseas", dates: range("2026-09-01", "2026-09-21") },
  { name: "Sriraag", note: "work travel", dates: ["2026-08-27", "2026-09-03", "2026-09-10"] },
  { name: "Anvita", note: null, dates: ["2026-09-04", "2026-09-10", "2026-09-11", ...range("2026-11-01", "2026-11-07")] },
  { name: "Triveni", note: "family", dates: ["2026-09-04", "2026-09-10", "2026-10-15", "2026-10-22"] },
  { name: "Jothsna", note: null, dates: ["2026-08-27", "2026-10-08", "2026-11-12"] },
  { name: "Rhuben", note: "long weekend", dates: ["2026-08-27", ...range("2026-10-02", "2026-10-05")] },
  { name: "Ashwin", note: null, dates: ["2026-09-24"] },
];

/** One opt-in cycle, so predicted days can be seen reaching the roster. */
const CYCLE = { name: "Shravya", lastStart: "2026-08-24", cycleLengthDays: 28, durationDays: 4 };

const singers = await prisma.singer.findMany({ select: { id: true, name: true } });
const idOf = new Map(singers.map((s) => [s.name, s.id]));

if (clear) {
  const c = await prisma.singerCycle.deleteMany({});
  const u = await prisma.singerUnavailability.deleteMany({});
  console.log(`Cleared ${u.count} unavailability row(s) and ${c.count} cycle row(s) from ${dbName}.`);
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.singerCycle.deleteMany({});
await prisma.singerUnavailability.deleteMany({});

let written = 0;
for (const p of PLAN) {
  const id = idOf.get(p.name);
  if (!id) {
    console.log(`  ? no singer called ${p.name} — skipped`);
    continue;
  }
  for (const iso of p.dates) {
    await prisma.singerUnavailability.create({
      data: { singerId: id, date: d(iso), note: p.note },
    });
    written++;
  }
  console.log(`  ${p.name.padEnd(10)} ${String(p.dates.length).padStart(2)} day(s)  ${p.dates[0]}${p.dates.length > 1 ? ` … ${p.dates[p.dates.length - 1]}` : ""}`);
}

const cycleId = idOf.get(CYCLE.name);
if (cycleId) {
  await prisma.singerCycle.create({
    data: {
      singerId: cycleId,
      lastStart: d(CYCLE.lastStart),
      cycleLengthDays: CYCLE.cycleLengthDays,
      durationDays: CYCLE.durationDays,
    },
  });
  console.log(`  ${CYCLE.name.padEnd(10)} cycle from ${CYCLE.lastStart}, every ${CYCLE.cycleLengthDays}d for ${CYCLE.durationDays}d (predicted, not stored)`);
}

console.log(`\n${written} dates written to ${dbName}. Three singers deliberately have nothing.`);
console.log("Remove it all with: --clear");
await prisma.$disconnect();
