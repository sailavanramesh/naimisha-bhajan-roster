import { prisma } from "@/lib/db";
import { pushToSingers, pushConfigured } from "@/lib/push";
import { missingParts, nudgeNotification, type NoticeKind } from "@/lib/notify";
import {
  dueNudgeUnder,
  resolveRule,
  weekdayOfISO,
  type ScopedRule,
} from "@/lib/nudgeRules";
import { melbourneTodayISO, melbourneHour } from "@/lib/dates";
import { NOT_ARCHIVED } from "./archive";

/**
 * lib/nudgeRun.ts — the day-of chase.
 *
 * Everything the app sends otherwise is triggered by somebody saving something.
 * This one is triggered by the clock, which is why it lives behind an endpoint
 * a scheduler calls rather than inside an action (see app/api/nudges/run).
 *
 * Deliberately safe to call as often as you like. It re-reads the roster every
 * time and asks `dueNudge` what is owed, and SessionNotice's unique key on
 * (session, singer, kind) is the backstop if two runs ever overlap. Calling it
 * at 2am does nothing; calling it four times at 3pm sends one notification.
 */
export type NudgeRun = {
  hour: number;
  date: string;
  /** How many people were owed a nudge, whether or not a device took it. */
  due: number;
  /** How many of those actually had a message accepted by a push service. */
  nudged: number;
  /** Rostered people whose rows were already complete. */
  complete: number;
  skipped?: string;
};

export async function runNudges(now: Date = new Date()): Promise<NudgeRun> {
  const date = melbourneTodayISO(now);
  const hour = melbourneHour(now);
  const base = { hour, date, due: 0, nudged: 0, complete: 0 };

  // No global window any more: a Sunday morning session and a Thursday
  // evening one have different hours, so whether this hour matters can only be
  // answered per session. The cheap exit is now "no session today".
  if (!pushConfigured) return { ...base, skipped: "push is not configured" };

  const rules: ScopedRule[] = (await prisma.notificationRule.findMany()).map((r) => ({
    scope: r.scope,
    weekday: r.weekday,
    sessionId: r.sessionId,
    firstHour: r.firstHour,
    finalHour: r.finalHour,
    stopAfterHour: r.stopAfterHour,
    enabled: r.enabled,
  }));

  const sessions = await prisma.session.findMany({
    // Session dates are stored at UTC midnight and read as Melbourne dates.
    //
    // Bhajan sessions only. A music program has no SessionSlot rows, so it
    // could never nudge anybody — but it WOULD count as "something on today",
    // and a day holding nothing but a program would report a run that looked
    // at a session and found nothing to say instead of the true "nothing on
    // today". Nobody is chasing a program for a bhajan and a pitch.
    where: { ...NOT_ARCHIVED, date: new Date(`${date}T00:00:00.000Z`), format: "bhajans" },
    select: {
      id: true,
      slots: {
        orderBy: { position: "asc" },
        select: {
          singerId: true,
          confirmedPitch: true,
          bhajanTitle: true,
          festivalBhajanTitle: true,
          bhajan: { select: { title: true } },
        },
      },
      notices: { select: { singerId: true, kind: true } },
    },
  });

  let due = 0;
  let nudged = 0;
  let complete = 0;

  if (sessions.length === 0) return { ...base, skipped: "nothing on today" };

  for (const session of sessions) {
    const rule = resolveRule(rules, { id: session.id, weekday: weekdayOfISO(date) });

    const sentBySinger = new Map<string, NoticeKind[]>();
    for (const n of session.notices) {
      sentBySinger.set(n.singerId, [...(sentBySinger.get(n.singerId) ?? []), n.kind]);
    }

    // A singer can hold more than one slot. One notification each, about the
    // first row that is short of something — being told twice in one breath
    // that two different rows are incomplete is not more actionable than being
    // told once and opening the page.
    const firstGap = new Map<
      string,
      { missing: ReturnType<typeof missingParts>; title: string | null; pitch: string | null }
    >();

    for (const slot of session.slots) {
      if (!slot.singerId) continue;
      const title = slot.bhajan?.title ?? slot.bhajanTitle ?? slot.festivalBhajanTitle ?? null;
      const missing = missingParts({ bhajanTitle: title, confirmedPitch: slot.confirmedPitch });
      if (missing.length === 0) {
        if (!firstGap.has(slot.singerId)) complete++;
        continue;
      }
      if (!firstGap.has(slot.singerId)) {
        firstGap.set(slot.singerId, { missing, title, pitch: slot.confirmedPitch });
      }
    }

    for (const [singerId, gap] of firstGap) {
      const kind = dueNudgeUnder(rule, hour, sentBySinger.get(singerId) ?? []);
      if (!kind) continue;
      due++;

      const res = await pushToSingers(
        [singerId],
        nudgeNotification({
          sessionId: session.id,
          dateISO: date,
          missing: gap.missing,
          bhajanTitle: gap.title,
          confirmedPitch: gap.pitch,
          final: kind === "nudge_final",
          atHour: hour,
          todayISO: date,
        }),
      );

      // Recorded even when nothing was delivered. Somebody with no subscribed
      // device is not owed a retry every hour, and the record is what stops it.
      await prisma.sessionNotice.createMany({
        data: [{ sessionId: session.id, singerId, kind }],
        skipDuplicates: true,
      });
      if (res.sent > 0) nudged++;
    }
  }

  return { ...base, due, nudged, complete };
}
