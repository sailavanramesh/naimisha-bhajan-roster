/**
 * scripts/seedSessionMeta.ts — one-off, 2026-08-12.
 *
 *   npx tsx scripts/seedSessionMeta.ts          # report only
 *   npx tsx scripts/seedSessionMeta.ts --apply
 *
 * Sailavan asked for session categories and topics, said he would backfill
 * them by hand from records kept elsewhere, and chose to have the list started
 * off rather than empty.
 *
 * Three things:
 *
 * 1. FOUR CATEGORIES to make the field usable straight away. They are a table,
 *    not an enum, so all four can be renamed or deleted in Admin without a
 *    deploy — the centre owns this vocabulary, not the code.
 * 2. EVERY EXISTING THURSDAY becomes "Routine Thursday". 163 of 188 sessions
 *    in the seeded history are ordinary weekday sessions, so this is right far
 *    more often than not, and anything it gets wrong is one dropdown to fix.
 *    Nothing else is categorised — a guess about a Sunday would be a guess.
 * 3. A START TIME on everything, because there was none and "all of them PM
 *    for now" needs something concrete to mean. 19:00. Change it in one go
 *    with the SQL at the bottom of this file if the hall starts at another
 *    time; it is only a default, and every session is editable.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** The usual evening start. A default, not a fact — see the note above. */
const DEFAULT_START = "19:00";

const CATEGORIES = [
  { name: "Routine Thursday", order: 0 },
  { name: "Sunday", order: 1 },
  { name: "Festival", order: 2 },
  { name: "Special", order: 3 },
];

const THURSDAY = 4;

async function main() {
  console.log(APPLY ? "\nAPPLYING\n" : "\nDRY RUN — nothing will be written\n");

  for (const c of CATEGORIES) {
    const exists = await prisma.sessionCategory.findUnique({ where: { name: c.name } });
    if (exists) {
      console.log(`category "${c.name}" already there`);
      continue;
    }
    if (APPLY) await prisma.sessionCategory.create({ data: c });
    console.log(`category "${c.name}" created`);
  }

  const sessions = await prisma.session.findMany({
    select: { id: true, date: true, startsAt: true, categoryId: true },
  });

  const needTime = sessions.filter((s) => !s.startsAt);
  if (APPLY && needTime.length > 0) {
    await prisma.session.updateMany({
      where: { id: { in: needTime.map((s) => s.id) } },
      data: { startsAt: DEFAULT_START },
    });
  }
  console.log(`\nstart time set to ${DEFAULT_START} on ${needTime.length} sessions`);

  const routine = APPLY
    ? await prisma.sessionCategory.findUnique({ where: { name: "Routine Thursday" } })
    : null;

  // getUTCDay on a date stored at UTC midnight is the Melbourne weekday: the
  // column is a DATE, so there is no instant to shift.
  const thursdays = sessions.filter(
    (s) => !s.categoryId && s.date.getUTCDay() === THURSDAY,
  );
  if (APPLY && routine && thursdays.length > 0) {
    await prisma.session.updateMany({
      where: { id: { in: thursdays.map((s) => s.id) } },
      data: { categoryId: routine.id },
    });
  }
  console.log(`"Routine Thursday" set on ${thursdays.length} sessions`);
  console.log(
    `${sessions.length - thursdays.length} sessions left uncategorised, for Sailavan to fill in\n`,
  );

  if (!APPLY) console.log("Nothing was written. Re-run with --apply.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/*
 * To change the default start time on everything that still has the default:
 *
 *   UPDATE "Session" SET "startsAt" = '18:30' WHERE "startsAt" = '19:00';
 */
