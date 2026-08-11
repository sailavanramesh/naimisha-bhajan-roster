/**
 * lib/notify.ts — what a push notification says.
 *
 * Pure. No Prisma, no web-push.
 *
 * Two kinds, because Sailavan asked for two:
 *
 *   ROSTERED   you are singing. Alerts: sound, vibration, and it stays on the
 *              lock screen until dismissed.
 *   PUBLISHED  the roster for a day is up. Silent — it appears in the shade
 *              without interrupting anybody.
 *
 * The distinction is the whole point. A group of a dozen people cannot have
 * everybody buzzed every time a session is planned, but the three or four who
 * have to turn up and sing do need to know.
 */

export type NoticeKind = "rostered" | "published";

export type Notification = {
  title: string;
  body: string;
  /** Where tapping it goes. */
  url: string;
  /** Collapses earlier unread notices about the same session. */
  tag: string;
  /** False for the quiet kind: no sound, no vibration. */
  alert: boolean;
};

/** Melbourne date, written the way the group reads it. */
export function formatSessionDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

/**
 * "You are singing on Thursday 13 August."
 *
 * Names the bhajan when there is one, because that is what turns a reminder
 * into something you can act on — you can go and practise it. When the slot
 * has no bhajan yet, say so plainly rather than inventing one.
 */
export function rosteredNotification(input: {
  sessionId: string;
  dateISO: string;
  bhajanTitles: readonly string[];
}): Notification {
  const when = formatSessionDate(input.dateISO);
  const titles = input.bhajanTitles.filter((t) => t.trim().length > 0);

  let body: string;
  if (titles.length === 0) {
    body = `You are on the roster for ${when}. No bhajan chosen yet.`;
  } else if (titles.length === 1) {
    body = `You are singing ${titles[0]} on ${when}.`;
  } else {
    body = `You are singing ${titles.length} bhajans on ${when}: ${titles.join(", ")}.`;
  }

  return {
    title: "You are rostered",
    body,
    url: `/roster/${input.sessionId}`,
    tag: `rostered-${input.sessionId}`,
    alert: true,
  };
}

/**
 * "The roster for Thursday 13 August is up."
 *
 * Deliberately says nothing about who is singing. It goes to everybody, and a
 * list of names in a lock-screen banner is noise; whoever wants the detail
 * taps through.
 */
export function publishedNotification(input: {
  sessionId: string;
  dateISO: string;
  singerCount: number;
}): Notification {
  const when = formatSessionDate(input.dateISO);
  return {
    title: "Roster is up",
    body:
      input.singerCount > 0
        ? `${when} — ${input.singerCount} singer${input.singerCount === 1 ? "" : "s"} rostered.`
        : `${when} has been set up.`,
    url: `/roster/${input.sessionId}`,
    tag: `published-${input.sessionId}`,
    alert: false,
  };
}

/**
 * Whether a session is far enough ahead to be worth notifying about.
 *
 * Only the future. Filling in last week's pitches must not buzz anybody, and
 * that is the common case — most edits are to sessions that have happened.
 * Today counts: a roster published on the morning of a session is exactly when
 * people most need to know.
 */
export function shouldNotifyForSession(sessionISO: string, todayISO: string): boolean {
  return sessionISO >= todayISO;
}
