/**
 * Put the guide cards in the order lib/defaultGuide.ts says, and nothing else.
 *
 * `npm run db:guide` creates the cards that are missing and never touches an
 * existing one, which is right — a card somebody has rewritten must not be
 * reverted by a deploy. The cost is that a NEW card lands with whatever position
 * the code gives it, which may collide with a card already in the table, and two
 * cards sharing a position sort arbitrarily.
 *
 * So this sets `position` from the code, by key. **It writes nothing else** — not
 * the title, not the blurb, not the body. Reordering cards loses no wording;
 * that is what makes it safe to run against a database somebody has edited.
 *
 * Usage: DATABASE_URL=<url> node scripts/alignGuideOrder.mjs [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const dry = process.argv.includes("--dry");
const source = readFileSync("lib/defaultGuide.ts", "utf8");

// Read the pairs straight out of the source rather than importing TypeScript.
const wanted = new Map();
for (const m of source.matchAll(/key: "([a-z-]+)",\s*\n\s*position: (\d+),/g)) {
  wanted.set(m[1], Number(m[2]));
}
if (wanted.size === 0) {
  console.error("Found no key/position pairs in lib/defaultGuide.ts — aborting.");
  process.exit(1);
}

const prisma = new PrismaClient();
const rows = await prisma.guideSection.findMany({ select: { key: true, position: true, title: true } });

let changed = 0;
for (const row of rows.sort((a, b) => a.position - b.position)) {
  const target = wanted.get(row.key);
  if (target === undefined) {
    console.log(`  ?  ${row.key} (${row.position}) — not in the code, left alone`);
    continue;
  }
  if (target === row.position) continue;
  console.log(`  ${row.position} -> ${target}  ${row.key}`);
  changed++;
  if (!dry) await prisma.guideSection.update({ where: { key: row.key }, data: { position: target } });
}

const missing = [...wanted.keys()].filter((k) => !rows.some((r) => r.key === k));
if (missing.length) console.log(`  not in the database yet: ${missing.join(", ")} — run db:guide`);

console.log(dry ? `\n${changed} would move.` : `\n${changed} moved.`);
await prisma.$disconnect();
