"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth";
import { rosterAvailability } from "@/lib/availabilityQueries";
import { rosterBlockReason } from "@/lib/rosterEligibility";
import { NOT_ARCHIVED } from "@/lib/archive";
import { defaultSessionOf, USUAL_START } from "@/lib/sessionsOfDay";

const Input = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD."),
  singerIds: z.array(z.string().min(1)).min(1, "Choose at least one singer."),
});

/**
 * Roster the people picked out on the availability board.
 *
 * The board is the one place that shows a whole quarter at once, so it is where
 * somebody notices that a Thursday nobody has built yet has four people free.
 * Making them leave, find the date, create the session and re-pick the same
 * names was the gap.
 *
 * Creates the session if that date has none — the same find-or-create the date
 * switcher on the assign page uses, so a night built from here is a night like
 * any other.
 *
 * Bhajans are left empty on purpose, exactly as "add the fairest" does. Who
 * sings and what they sing are separate decisions, and the board knows nothing
 * about the second.
 *
 * ANYBODY UNAVAILABLE IS REFUSED HERE, not merely unclickable on the board. The
 * page could have been open since before somebody marked themselves away, and a
 * control that is hidden is not a rule.
 */
export async function rosterFromBoard(input: {
  date: string;
  singerIds: string[];
}): Promise<{ ok: false; error: string }> {
  await requireCapability("assignSingers");

  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not do that." };
  }
  const { date, singerIds } = parsed.data;
  const day = new Date(`${date}T00:00:00.000Z`);

  const unavailable = new Set(
    (await rosterAvailability(date, date)).map((a) => a.singerId),
  );
  const clashing = singerIds.filter((id) => unavailable.has(id));
  if (clashing.length > 0) {
    const names = await prisma.singer.findMany({
      where: { id: { in: clashing } },
      select: { name: true },
    });
    return {
      ok: false,
      error: `${names.map((n) => n.name).join(", ")} cannot sing that night. Reload the board — somebody has marked a date since it was opened.`,
    };
  }

  const singers = await prisma.singer.findMany({
    where: { id: { in: singerIds } },
    select: { id: true, name: true, gender: true },
  });
  for (const s of singers) {
    const blocked = rosterBlockReason(s);
    if (blocked) return { ok: false, error: blocked };
  }
  if (singers.length !== singerIds.length) {
    return { ok: false, error: "One of those singers no longer exists. Reload the board." };
  }

  const onThatDay = await prisma.session.findMany({
    where: { ...NOT_ARCHIVED, date: day },
    select: { id: true, startsAt: true, format: true },
  });
  const session =
    defaultSessionOf(onThatDay) ??
    (await prisma.session.create({
      data: { date: day, startsAt: USUAL_START },
      select: { id: true, startsAt: true },
    }));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.sessionSlot.findMany({
      where: { sessionId: session.id },
      select: { singerId: true, position: true },
    });
    const already = new Set(existing.map((e) => e.singerId).filter(Boolean) as string[]);
    let position = existing.reduce((max, e) => Math.max(max, e.position), 0);

    for (const s of singers) {
      // Pressing twice tops up rather than doubling somebody up.
      if (already.has(s.id)) continue;
      position += 1;
      await tx.sessionSlot.create({
        data: { sessionId: session.id, singerId: s.id, position },
      });
    }
  });

  revalidatePath("/availability/team");
  revalidatePath(`/roster/${session.id}`);
  // Straight to the assign page, which is where bhajans get chosen — the
  // decision the board deliberately does not make.
  redirect(`/roster/${session.id}/assign`);
}
