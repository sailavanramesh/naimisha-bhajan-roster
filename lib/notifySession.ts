import { prisma } from "@/lib/db";
import { pushToSingers, pushConfigured } from "@/lib/push";
import { rosteredNotification, publishedNotification, shouldNotifyForSession } from "@/lib/notify";
import { melbourneTodayISO } from "@/lib/dates";

/**
 * Tell people about a session that has just been rostered.
 *
 * Called after any change that puts singers on a future session. Safe to call
 * often — everything below is about NOT sending the same thing twice.
 *
 * Three rules, all of them about restraint:
 *
 * 1. FUTURE ONLY. Filling in last week's pitches is the commonest edit there
 *    is, and it must buzz nobody.
 * 2. ONCE PER PERSON PER SESSION. Rostering happens in bursts — four rows added
 *    one after another would otherwise be four notifications. SessionNotice
 *    records who has been told, so a later addition reaches only the person
 *    newly added.
 * 3. NEVER BLOCKS THE SAVE. Any failure here is swallowed. A coordinator saving
 *    a roster must not see an error because a push service was down.
 */
export async function notifyAboutSession(sessionId: string): Promise<{
  rostered: number;
  published: number;
  skipped?: string;
}> {
  const nothing = { rostered: 0, published: 0 };
  if (!pushConfigured) return { ...nothing, skipped: "push is not configured" };

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        date: true,
        slots: {
          select: {
            singerId: true,
            bhajanTitle: true,
            bhajan: { select: { title: true } },
            festivalBhajanTitle: true,
          },
        },
      },
    });
    if (!session) return { ...nothing, skipped: "no such session" };

    const dateISO = session.date.toISOString().slice(0, 10);
    if (!shouldNotifyForSession(dateISO, melbourneTodayISO())) {
      return { ...nothing, skipped: "session is in the past" };
    }

    // What each rostered person is singing.
    const byRosteredSinger = new Map<string, string[]>();
    for (const slot of session.slots) {
      if (!slot.singerId) continue;
      const title = slot.bhajan?.title ?? slot.bhajanTitle ?? slot.festivalBhajanTitle ?? "";
      const titles = byRosteredSinger.get(slot.singerId) ?? [];
      if (title) titles.push(title);
      byRosteredSinger.set(slot.singerId, titles);
    }
    if (byRosteredSinger.size === 0) return { ...nothing, skipped: "nobody rostered yet" };

    const already = await prisma.sessionNotice.findMany({
      where: { sessionId },
      select: { singerId: true, kind: true },
    });
    const told = new Set(already.map((a) => `${a.singerId}:${a.kind}`));

    // 1. The people singing — one alert each, naming their own bhajans.
    let rostered = 0;
    for (const [singerId, titles] of byRosteredSinger) {
      if (told.has(`${singerId}:rostered`)) continue;
      const res = await pushToSingers(
        [singerId],
        rosteredNotification({ sessionId, dateISO, bhajanTitles: titles }),
      );
      await prisma.sessionNotice.create({
        data: { sessionId, singerId, kind: "rostered" },
      });
      rostered += res.sent;
    }

    // 2. Everybody else — one quiet notice that the roster is up.
    const others = await prisma.singer.findMany({
      where: { id: { notIn: [...byRosteredSinger.keys()] } },
      select: { id: true },
    });
    const toTell = others.filter((o) => !told.has(`${o.id}:published`)).map((o) => o.id);

    let published = 0;
    if (toTell.length > 0) {
      const res = await pushToSingers(
        toTell,
        publishedNotification({ sessionId, dateISO, singerCount: byRosteredSinger.size }),
      );
      await prisma.sessionNotice.createMany({
        data: toTell.map((singerId) => ({ sessionId, singerId, kind: "published" as const })),
        skipDuplicates: true,
      });
      published = res.sent;
    }

    return { rostered, published };
  } catch (e) {
    // Never let a notification failure break the thing that triggered it.
    console.error("notifyAboutSession failed", e);
    return { ...nothing, skipped: "error" };
  }
}
