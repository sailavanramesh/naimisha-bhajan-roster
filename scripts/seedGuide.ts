/**
 * Put the shipped guide text into GuideSection.
 *
 *   npm run db:guide
 *
 * IDEMPOTENT, AND ONE-WAY. It creates the cards that are missing and leaves
 * every existing card exactly as it is — a deploy must never quietly revert
 * wording Sailavan has since rewritten, which is the whole reason the guide
 * moved into the database.
 *
 * To put ONE card back to the shipped words, use "restore the original text" on
 * the page. That is a decision somebody makes about a card they are looking at,
 * not something a script does to all ten.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_GUIDE } from "../lib/defaultGuide";

const prisma = new PrismaClient();

async function main() {
  const existing = new Set(
    (await prisma.guideSection.findMany({ select: { key: true } })).map((s) => s.key),
  );

  const missing = DEFAULT_GUIDE.filter((s) => !existing.has(s.key));

  if (missing.length === 0) {
    console.log(`Guide is already seeded — ${existing.size} sections, none added.`);
    return;
  }

  await prisma.guideSection.createMany({ data: missing });
  console.log(
    `Added ${missing.length} section${missing.length === 1 ? "" : "s"}: ${missing
      .map((s) => s.key)
      .join(", ")}`,
  );
  if (existing.size > 0) {
    console.log(`Left ${existing.size} existing section${existing.size === 1 ? "" : "s"} alone.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
