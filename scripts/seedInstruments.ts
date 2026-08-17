/**
 * scripts/seedInstruments.ts — the starting instrument list.
 *
 * Instruments are DATA, managed at /admin. This fills in a sensible starting
 * list; it never deletes, never renames and never retires, so a coordinator's
 * edits survive a re-run.
 *
 * Two sources, both real:
 *
 *   - The bhajan roster's own seven, from lib/instrumentScoring.ts. These
 *     names must match EXACTLY, because `InstrumentPerson` eligibility is keyed
 *     by name and the scoring reads it.
 *   - Everything the four music program documents actually name: Keyboard,
 *     Violin, Mridangam, Kanjira, Cymbals and a karaoke track played through
 *     the system. Nothing here is invented — an instrument nobody has played
 *     is one more thing in a picker.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/seedInstruments.ts
 */

import { prisma } from "../lib/db";
import { INSTRUMENTS } from "../lib/instrumentScoring";

type Seed = { name: string; scope: "bhajans" | "program" | "both" };

/**
 * From the documents, in the order a program lists them: the drum, the drone,
 * then the melody instruments.
 *
 * "Karaoke track" is the odd one and belongs here anyway — the birthday
 * program's English song was sung to one "through the system", and the sound
 * desk needs it on the list for exactly the same reason a harmonium is.
 */
const FROM_PROGRAMS: Seed[] = [
  { name: "Tabla", scope: "both" },
  { name: "Harmonium", scope: "both" },
  { name: "Keyboard", scope: "program" },
  { name: "Violin", scope: "program" },
  { name: "Mridangam", scope: "program" },
  { name: "Kanjira", scope: "program" },
  { name: "Flute", scope: "program" },
  /*
   * Plain "Cymbals", as distinct from the roster's "Cymbals (Male)" and
   * "Cymbals (Female)".
   *
   * Not a tidy-up of those two — they are the roster's own split and the
   * eligibility rows depend on the exact names. This is the third name that
   * genuinely exists: the birthday program lists "Cymbals: Sriram" without a
   * side, and the imported eligibility lookup has plain `Cymbals` rows that
   * would otherwise point at no instrument at all.
   */
  { name: "Cymbals", scope: "program" },
  { name: "Karaoke track", scope: "program" },
];

async function main() {
  // The roster's seven first, so their order in the picker matches the order
  // the roster screen has always shown them in.
  const rosterSeeds: Seed[] = INSTRUMENTS.map((name) => ({
    name,
    // Tabla and Harmonium are claimed by FROM_PROGRAMS as `both`; the rest are
    // bhajan-session things (Chorus Mic, the two Cymbals roles, Tambourine).
    scope: FROM_PROGRAMS.some((p) => p.name === name) ? "both" : "bhajans",
  }));

  const wanted: Seed[] = [];
  for (const seed of [...rosterSeeds, ...FROM_PROGRAMS]) {
    if (wanted.some((w) => w.name.toLowerCase() === seed.name.toLowerCase())) continue;
    wanted.push(seed);
  }

  let added = 0;
  let left = 0;

  for (const [index, seed] of wanted.entries()) {
    const existing = await prisma.instrument.findFirst({
      where: { name: { equals: seed.name, mode: "insensitive" } },
    });
    if (existing) {
      left++;
      continue;
    }
    await prisma.instrument.create({
      data: { name: seed.name, scope: seed.scope, order: index },
    });
    added++;
  }

  console.log(`instruments: ${added} added, ${left} already there`);

  // A name in the eligibility lookup with no instrument to match it would
  // score everybody as ineligible for something nobody can see. Worth saying
  // out loud rather than leaving to be discovered.
  const eligibilityNames = await prisma.instrumentPerson.groupBy({ by: ["instrument"] });
  const instrumentNames = new Set(
    (await prisma.instrument.findMany({ select: { name: true } })).map((i) => i.name),
  );
  const orphaned = eligibilityNames
    .map((e) => e.instrument)
    .filter((name) => !instrumentNames.has(name));
  if (orphaned.length > 0) {
    console.log(`eligibility names with no instrument row: ${orphaned.join(", ")}`);
  }

  await prisma.$disconnect();
}

void main();
