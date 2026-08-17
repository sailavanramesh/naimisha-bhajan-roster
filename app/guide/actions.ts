"use server";

import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { DEFAULT_GUIDE, defaultGuideSection } from "@/lib/defaultGuide";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Editing /guide — the page everybody reads.
 *
 * Every action here is gated on `editGuide`, which only an owner holds. Hiding
 * the editor is not authorisation; these are ordinary Server Actions anybody
 * can POST to, and the check is what actually stops them.
 *
 * Nothing in this file reaches any other table. The worst an edit can do is
 * make the guide wrong, and `restoreSection` puts any single card back to the
 * words in lib/defaultGuide.ts without a database restore.
 */

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };

function refresh() {
  revalidatePath("/guide");
}

/** Trimmed; an emptied field means "unset", not an empty string. */
const Optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s));

/**
 * Where a heading may point.
 *
 * An app path or nothing. Not http — a guide card's heading is a way into this
 * app, and an off-site heading on the page that teaches people what to trust is
 * the one link worth being strict about. Links inside a body may be external;
 * lib/guideText.ts decides that, and refuses `javascript:` there.
 */
const Href = z
  .string()
  .trim()
  .max(200)
  .refine((s) => s.length === 0 || s.startsWith("/"), "A link must start with /")
  .transform((s) => (s.length === 0 ? null : s));

const SectionInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "A card needs a title.").max(120),
  href: Href,
  blurb: Optional(300),
  body: z.string().trim().max(20_000),
  coordinatorOnly: z.boolean(),
  hidden: z.boolean(),
});

export async function saveGuideSection(input: z.input<typeof SectionInput>): Promise<Result> {
  try {
    await requireCapability("editGuide");
    const data = SectionInput.parse(input);
    const { id, ...fields } = data;

    await prisma.guideSection.update({ where: { id }, data: fields });
    refresh();
    return ok;
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * A new card, appended.
 *
 * At the end rather than inserted, then moved — the same choice the running
 * order makes, and for the same reason: a card that appears in the middle of a
 * page you are reading is a surprise.
 *
 * Its key is generated and matches nothing in defaultGuide.ts, so "restore the
 * original text" correctly has nothing to offer on it.
 */
export async function addGuideSection(): Promise<Result> {
  try {
    await requireCapability("editGuide");

    const last = await prisma.guideSection.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    await prisma.guideSection.create({
      data: {
        key: `custom-${Date.now().toString(36)}`,
        position: (last?.position ?? 0) + 1,
        title: "A new section",
        body: "",
        hidden: true,
      },
    });

    refresh();
    return ok;
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function removeGuideSection(input: { id: string }): Promise<Result> {
  try {
    await requireCapability("editGuide");
    const id = z.string().min(1).parse(input.id);

    await prisma.guideSection.delete({ where: { id } });
    refresh();
    return ok;
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Move a card up or down.
 *
 * Swaps positions with its neighbour in a transaction, via a position no row
 * holds — `position` is not unique, but two cards briefly sharing one would
 * order by whatever the database felt like in between.
 */
export async function moveGuideSection(input: {
  id: string;
  direction: "up" | "down";
}): Promise<Result> {
  try {
    await requireCapability("editGuide");
    const { id, direction } = z
      .object({ id: z.string().min(1), direction: z.enum(["up", "down"]) })
      .parse(input);

    const sections = await prisma.guideSection.findMany({
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    const at = sections.findIndex((s) => s.id === id);
    if (at === -1) return { ok: false, error: "That section is gone." };

    const swapWith = direction === "up" ? at - 1 : at + 1;
    if (swapWith < 0 || swapWith >= sections.length) return ok;

    const a = sections[at];
    const b = sections[swapWith];
    const parked = Math.min(...sections.map((s) => s.position)) - 1;

    await prisma.$transaction([
      prisma.guideSection.update({ where: { id: a.id }, data: { position: parked } }),
      prisma.guideSection.update({ where: { id: b.id }, data: { position: a.position } }),
      prisma.guideSection.update({ where: { id: a.id }, data: { position: b.position } }),
    ]);

    refresh();
    return ok;
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Put one card back to the words shipped in the code. */
export async function restoreGuideSection(input: { id: string }): Promise<Result> {
  try {
    await requireCapability("editGuide");
    const id = z.string().min(1).parse(input.id);

    const section = await prisma.guideSection.findUnique({
      where: { id },
      select: { key: true },
    });
    if (!section) return { ok: false, error: "That section is gone." };

    const original = defaultGuideSection(section.key);
    if (!original) {
      return { ok: false, error: "This section was written here, so there is nothing to restore to." };
    }

    await prisma.guideSection.update({
      where: { id },
      data: {
        title: original.title,
        href: original.href,
        blurb: original.blurb,
        body: original.body,
        coordinatorOnly: original.coordinatorOnly,
      },
    });

    refresh();
    return ok;
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Fill an empty table with the shipped guide.
 *
 * The same thing `npm run db:guide` does, offered in the app so a fresh
 * database does not need somebody at a terminal. Deliberately refuses to run
 * over an existing guide — the way to get one card back is `restore`, and the
 * way to get the whole page back is to restore each card, which asks for it
 * once per card rather than wiping a rewrite in one press.
 */
export async function seedGuideFromCode(): Promise<Result> {
  try {
    await requireCapability("editGuide");

    const existing = await prisma.guideSection.count();
    if (existing > 0) {
      return { ok: false, error: "The guide already has sections. Restore them one at a time." };
    }

    await prisma.guideSection.createMany({ data: DEFAULT_GUIDE });
    refresh();
    return ok;
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function message(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "That is not valid.";
  return e instanceof Error ? e.message : "That did not save.";
}
