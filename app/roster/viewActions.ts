"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RosterView } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSignedInSinger, requireCapability } from "@/lib/auth";
import { defaultSessionOf, USUAL_START } from "@/lib/sessionsOfDay";
import { NOT_ARCHIVED } from "@/lib/archive";

/**
 * Remember whether this person prefers the calendar or the list.
 *
 * Stored on the person, not in a cookie, so it follows them from the phone
 * they use in the hall to the laptop they plan on. Everybody signs in, so
 * there is always somebody to store it against.
 *
 * Switching view does NOT change the default — that would make it impossible
 * to take a quick look at the other one. Saying so is a separate, deliberate
 * act, which is why this is its own action.
 */
export async function setDefaultRosterView(
  view: "calendar" | "list",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getSignedInSinger();
  if (!me) {
    return {
      ok: false,
      error: "Sign in with Google and the app can remember this for you.",
    };
  }

  await prisma.singer.update({
    where: { id: me.id },
    data: { defaultRosterView: view === "list" ? RosterView.list : RosterView.calendar },
  });

  revalidatePath("/roster");
  return { ok: true };
}

const StartOn = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
});

/**
 * Start a session on a given day, from the list view.
 *
 * The calendar has always been able to do this — tap a day — and the list
 * simply could not, so anybody who preferred the list had to switch views to
 * create anything. Now that the list can be somebody's default, that gap
 * would have been the first thing they hit.
 *
 * Finds the day's usual evening session rather than making a second one, for
 * the same reason tapping a day does: see lib/sessionsOfDay.ts.
 */
export async function startSessionOnDate(formData: FormData): Promise<void> {
  await requireCapability("buildSessions");

  const parsed = StartOn.safeParse({ date: String(formData.get("date") ?? "") });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Pick a date.");
  }
  const day = new Date(`${parsed.data.date}T00:00:00.000Z`);

  // `format` is selected so defaultSessionOf can step around music programs —
  // without it every program looks like an ordinary session to that filter.
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

  revalidatePath("/roster");
  redirect(`/roster/${session.id}`);
}
