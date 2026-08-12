/**
 * scripts/mergeRepertoire.ts — one-off, 2026-08-12.
 *
 *   npx tsx scripts/mergeRepertoire.ts          # report only, writes nothing
 *   npx tsx scripts/mergeRepertoire.ts --apply  # do it
 *
 * Three jobs, all agreed with Sailavan:
 *
 * 1. FESTIVAL STOPS BEING A STAGE. The seed read two sheets — "Festival
 *    Bhajans" and "Singer Bhajan List" — and wrote a row from each, so a
 *    bhajan a person does at festivals AND knows appeared twice on their page.
 *    72 of 413 (singer, bhajan) pairs were doubled that way. The festival row
 *    is folded into the other one as `isFestival = true`. No festival row
 *    carries a pitch or a note, so nothing is lost in the merge.
 *
 * 2. THE NINE ORPHANS. Nine festival rows have no matching entry at another
 *    stage. Sailavan chose `learning` for them: they show on the singer's page
 *    and score lower in suggestions until somebody confirms they know it.
 *
 * 3. HISTORY BECOMES REPERTOIRE. 512 (singer, bhajan) pairs have actually been
 *    sung and 388 of them were on nobody's list — the app knew far more from
 *    the roster than from the lists. Each becomes a `known` entry carrying the
 *    pitch they last sang it at, so suggestions can use it.
 *
 * SAFETY. This only ever writes SingerRepertoire. It does not read, write or
 * go near SessionSlot.confirmedPitch — the 709 sung records are untouched, and
 * `npx vitest run tests/singerOffsets.test.ts` still has to pass afterwards.
 * Every row it creates is stamped in `note` so it can be found and reversed.
 */

import { PrismaClient, RepertoireKind } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** Stamped on rows this script creates, so they can be found again. */
const STAMP = "Added from the roster — sung on";

async function main() {
  const mode = APPLY ? "APPLYING" : "DRY RUN — nothing will be written";
  console.log(`\n${mode}\n${"=".repeat(mode.length)}\n`);

  const before = await prisma.singerRepertoire.count();

  // ---- 1 & 2. Festival rows -------------------------------------------
  const festivalRows = await prisma.singerRepertoire.findMany({
    where: { kind: RepertoireKind.festival },
    select: { id: true, singerId: true, bhajanId: true, title: true },
  });

  let merged = 0;
  let promoted = 0;

  for (const f of festivalRows) {
    const twin = await prisma.singerRepertoire.findFirst({
      where: {
        singerId: f.singerId,
        kind: { not: RepertoireKind.festival },
        ...(f.bhajanId ? { bhajanId: f.bhajanId } : { title: f.title }),
      },
      select: { id: true },
    });

    if (twin) {
      // The stage row survives and gains the flag; the duplicate goes.
      if (APPLY) {
        await prisma.singerRepertoire.update({
          where: { id: twin.id },
          data: { isFestival: true },
        });
        await prisma.singerRepertoire.delete({ where: { id: f.id } });
      }
      merged++;
    } else {
      if (APPLY) {
        await prisma.singerRepertoire.update({
          where: { id: f.id },
          data: { kind: RepertoireKind.learning, isFestival: true },
        });
      }
      promoted++;
    }
  }

  console.log(`Festival duplicates folded into the stage row : ${merged}`);
  console.log(`Festival-only rows moved to "learning"        : ${promoted}`);

  // ---- 3. History becomes repertoire ----------------------------------
  //
  // Only what has actually been sung. A pitch typed while PLANNING a future
  // session is not evidence that anybody sang anything — the same rule the
  // offset profiles use (lib/dates.ts, historyCutoff).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const sung = await prisma.sessionSlot.findMany({
    where: {
      singerId: { not: null },
      bhajanId: { not: null },
      session: { date: { lte: new Date(`${today}T00:00:00.000Z`) } },
    },
    orderBy: { session: { date: "desc" } },
    select: {
      singerId: true,
      bhajanId: true,
      confirmedPitch: true,
      session: { select: { date: true } },
      bhajan: { select: { title: true } },
    },
  });

  // Most recent first, so the first sighting of a pair is its latest pitch.
  const latest = new Map<
    string,
    { singerId: string; bhajanId: string; title: string; pitch: string | null; on: Date }
  >();
  for (const s of sung) {
    const key = `${s.singerId}|${s.bhajanId}`;
    if (latest.has(key)) continue;
    latest.set(key, {
      singerId: s.singerId!,
      bhajanId: s.bhajanId!,
      title: s.bhajan?.title ?? "",
      pitch: s.confirmedPitch,
      on: s.session.date,
    });
  }

  const existing = await prisma.singerRepertoire.findMany({
    select: { singerId: true, bhajanId: true, title: true, preferredPitch: true, id: true },
  });
  const have = new Map(
    existing.filter((e) => e.bhajanId).map((e) => [`${e.singerId}|${e.bhajanId}`, e]),
  );

  let created = 0;
  let pitchFilled = 0;
  let alreadyThere = 0;

  for (const [key, row] of latest) {
    const seen = have.get(key);
    if (seen) {
      alreadyThere++;
      // Their list says they know it but never said at what pitch. The roster
      // does. Only fills a blank — a pitch they chose themselves always wins.
      if (!seen.preferredPitch && row.pitch) {
        if (APPLY) {
          await prisma.singerRepertoire.update({
            where: { id: seen.id },
            data: { preferredPitch: row.pitch },
          });
        }
        pitchFilled++;
      }
      continue;
    }
    if (!row.title) continue;

    if (APPLY) {
      await prisma.singerRepertoire.create({
        data: {
          singerId: row.singerId,
          bhajanId: row.bhajanId,
          title: row.title,
          kind: RepertoireKind.known,
          preferredPitch: row.pitch,
          note: `${STAMP} ${row.on.toISOString().slice(0, 10)}.`,
        },
      });
    }
    created++;
  }

  console.log(`Sung pairs already on a list                  : ${alreadyThere}`);
  console.log(`  …of those, a blank pitch filled from history: ${pitchFilled}`);
  console.log(`New "know it" entries from the roster         : ${created}`);

  const after = APPLY ? await prisma.singerRepertoire.count() : before - merged + created;
  console.log(`\nRepertoire rows: ${before} → ${after}\n`);

  if (!APPLY) console.log("Nothing was written. Re-run with --apply.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
