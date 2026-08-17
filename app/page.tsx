import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { melbourneTodayISO } from "@/lib/dates";
import { defaultSessionOf } from "@/lib/sessionsOfDay";
import { NOT_ARCHIVED } from "@/lib/archive";

/**
 * The front door opens on the session people are about to sing.
 *
 * Sailavan: the roster is what people come for. The dashboard is a
 * coordinator's overview — session counts, fairness loads, what needs building
 * — and members do not even see it in the nav any more, so landing them there
 * meant a page they could not act on.
 *
 * Then, 2026-08-12: not the calendar either, but "the nearest future session
 * that has at least 1 bhajan or name populated". Opening the app is almost
 * always about the next time the group sings — who is on, what they are
 * singing, at what pitch — and making everyone start with a tap on a date is a
 * tap for nothing.
 *
 * "At least one bhajan or name" is what separates a real session from an empty
 * record. Sessions get drafted ahead and sit blank for weeks; landing on one of
 * those would be worse than the calendar, because it looks like the app has
 * lost the roster.
 *
 * Today counts as future. A session is sung in the evening and filled in during
 * or just after it, so on the day itself it is exactly the page you want.
 */
export default async function Home() {
  const today = new Date(`${melbourneTodayISO()}T00:00:00.000Z`);

  const candidates = await prisma.session.findMany({
    where: {
      ...NOT_ARCHIVED,
      date: { gte: today },
      slots: {
        some: {
          OR: [
            { singerId: { not: null } },
            { bhajanId: { not: null } },
            { bhajanTitle: { not: null } },
            { festivalBhajanTitle: { not: null } },
          ],
        },
      },
    },
    orderBy: { date: "asc" },
    select: { id: true, date: true, startsAt: true },
  });

  /*
   * The nearest day that has something on it, then the usual evening session
   * within that day — a 9am festival session on the same date should not be
   * what the app opens on.
   */
  const firstDate = candidates[0]?.date.getTime();
  const next = defaultSessionOf(candidates.filter((c) => c.date.getTime() === firstDate));

  // Nothing planned yet — the calendar, where the next thing to do is plan one.
  redirect(next ? `/roster/${next.id}` : "/roster");
}
