/**
 * lib/notify.ts — what a push notification says.
 *
 * Pure. No Prisma, no web-push.
 *
 * Four kinds:
 *
 *   ROSTERED     you are singing. Alerts: sound, vibration, and it stays on the
 *                lock screen until dismissed.
 *   PUBLISHED    the roster for a day is up. Silent — it appears in the shade
 *                without interrupting anybody.
 *   NUDGE        3pm on the day you are singing and your row is still not
 *                filled in. Alerts, because it is asking you to do something
 *                and there are hours left in which to do it.
 *   NUDGE_FINAL  5pm, the second and last one. Nobody is nudged a third time.
 *   REMOVED      you were taken off a session you had been put on. Alerts —
 *                somebody who has been practising needs telling.
 *
 * The distinction is the whole point. A group of a dozen people cannot have
 * everybody buzzed every time a session is planned, but the three or four who
 * have to turn up and sing do need to know.
 */

export type NoticeKind = "rostered" | "published" | "nudge" | "nudge_final";

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

/* ------------------------------------------------------------------ *\
 * The day-of nudge.
 *
 * A rostered row is only useful once it says WHAT is being sung and AT WHAT
 * PITCH — the tabla player tunes from the pitch, and nobody can practise a
 * bhajan nobody has named. Both are routinely left until the last minute, and
 * the person who has to chase them is a volunteer.
\* ------------------------------------------------------------------ */

/** Which of the two things a slot is still short of. */
export type MissingPart = "bhajan" | "pitch";

export function missingParts(slot: {
  bhajanTitle: string | null;
  confirmedPitch: string | null;
}): MissingPart[] {
  const out: MissingPart[] = [];
  if (!slot.bhajanTitle || slot.bhajanTitle.trim().length === 0) out.push("bhajan");
  if (!slot.confirmedPitch || slot.confirmedPitch.trim().length === 0) out.push("pitch");
  return out;
}

/**
 * Ask for exactly what is missing, and nothing else.
 *
 * The three cases read differently on purpose. Telling somebody who has chosen
 * their bhajan to "pick your bhajan and pitch" is the kind of thing that makes
 * people stop reading notifications, and a nudge that gets ignored is worse
 * than none — it costs the same attention and buys nothing.
 *
 * `final` only changes the framing, never the ask. It is the last one, so it
 * says so; a reminder that might be followed by six more is easy to defer.
 */
export function nudgeNotification(input: {
  sessionId: string;
  dateISO: string;
  missing: readonly MissingPart[];
  /** Named when it is known, so the message is about something concrete. */
  bhajanTitle?: string | null;
  confirmedPitch?: string | null;
  final?: boolean;
  /**
   * The hour the reminder is being sent at, so the message can say when the
   * session is. Most are in the evening, but some are mornings, and "tonight"
   * on a 7am reminder for a 9am session is simply wrong — see lib/nudgeRules.
   */
  atHour?: number;
  /**
   * Today, in Melbourne. Without it the message assumes the session is today,
   * which is true of the automatic reminder and NOT true of one an editor
   * sends by hand — that is the bug Sailavan caught: a reminder about
   * tomorrow's session that read "you are singing tonight".
   */
  todayISO?: string;
}): Notification {
  const wantsBhajan = input.missing.includes("bhajan");
  const wantsPitch = input.missing.includes("pitch");
  const when = whenWord(input.dateISO, input.todayISO, input.atHour);

  let body: string;
  if (wantsBhajan && wantsPitch) {
    body = `You are singing ${when}. Choose your bhajan and confirm your pitch.`;
  } else if (wantsPitch) {
    body = input.bhajanTitle
      ? `You are singing ${input.bhajanTitle} ${when}. Confirm the pitch so the tabla can be tuned.`
      : `You are singing ${when}. Confirm your pitch so the tabla can be tuned.`;
  } else {
    body = input.confirmedPitch
      ? `You are singing ${when} at ${input.confirmedPitch}. Which bhajan?`
      : `You are singing ${when}. Which bhajan?`;
  }

  return {
    // "on Sunday 16 August" is right in a sentence and wrong in a title.
    title: input.final
      ? `Last reminder — ${when.replace(/^on /, "")}`
      : `Your bhajan for ${when.replace(/^on /, "")}`,
    body,
    url: `/roster/${input.sessionId}`,
    // Deliberately one tag for both, so the 5pm one REPLACES the 3pm one in
    // the shade rather than sitting under it. Two identical-looking unread
    // reminders read as a broken app.
    tag: `nudge-${input.sessionId}`,
    alert: true,
  };
}

/**
 * When the session is, said the way a person would say it.
 *
 * Two questions, in order. WHICH DAY first: the automatic reminder only ever
 * goes out on the day, but an editor can send one by hand about any session,
 * and "you are singing tonight" about tomorrow is worse than useless — it is
 * the one that makes somebody turn up on the wrong evening.
 *
 * Then, for today only, WHEN today. A reminder sent at 7am is for a session
 * later that morning; one sent at 3pm is for the evening. In between is
 * "today", which is true whichever it turns out to be.
 */
export function whenWord(dateISO: string, todayISO?: string, atHour?: number): string {
  if (todayISO && dateISO !== todayISO) {
    if (dateISO === addDaysISO(todayISO, 1)) return "tomorrow";
    return `on ${formatSessionDate(dateISO)}`;
  }
  if (atHour === undefined) return "tonight";
  if (atHour < 11) return "this morning";
  if (atHour < 15) return "today";
  return "tonight";
}

/** ISO-string arithmetic, so no timezone can shift the day. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 3pm, then 5pm. Melbourne hours. The fallback — see lib/nudgeRules.ts. */
export const NUDGE_HOUR = 15;
export const NUDGE_FINAL_HOUR = 17;
/**
 * After this, stop. Bhajans start in the evening; a reminder that arrives once
 * everybody is already in the hall is only an interruption.
 */
export const NUDGE_LATEST_HOUR = 20;

/**
 * Which nudge, if any, is owed to a person right now.
 *
 * `sent` is the kinds they have already had for this session.
 *
 * From 5pm the answer is the final one whether or not the 3pm one went out —
 * that is what makes a missed cron tick harmless rather than silent. It also
 * means a person who got the 3pm reminder gets exactly one more, which is what
 * Sailavan chose.
 */
export function dueNudge(
  melbourneHour: number,
  sent: readonly NoticeKind[],
): "nudge" | "nudge_final" | null {
  if (melbourneHour < NUDGE_HOUR || melbourneHour >= NUDGE_LATEST_HOUR) return null;
  if (melbourneHour >= NUDGE_FINAL_HOUR) {
    return sent.includes("nudge_final") ? null : "nudge_final";
  }
  return sent.includes("nudge") ? null : "nudge";
}

/**
 * "You are no longer on the roster for Thursday 13 August."
 *
 * The counterpart of `rosteredNotification`, and it alerts for the same
 * reason: being told you are singing and then quietly not singing is the one
 * that wastes somebody's week. Says nothing about who replaced them or why —
 * that is a conversation, and a lock-screen banner is a bad place to start it.
 *
 * Not recorded in SessionNotice. Being added, removed and added again is a
 * normal thing for a roster to do, and each of those is news.
 */
export function removedNotification(input: {
  sessionId: string;
  dateISO: string;
}): Notification {
  return {
    title: "Roster change",
    body: `You are no longer on the roster for ${formatSessionDate(input.dateISO)}.`,
    url: `/roster/${input.sessionId}`,
    tag: `removed-${input.sessionId}`,
    alert: true,
  };
}

/**
 * Somebody who is on a roster has said they cannot make it.
 *
 * Goes to the coordinators, not to the singer: they already know. The point is
 * that a slot has quietly become empty and nobody would otherwise find out
 * until the night.
 *
 * `alert: true` because this one needs acting on — a session with a singer who
 * is not coming is worse than a session with an obvious gap.
 *
 * The date is in the tag as well as the session, so two people dropping out of
 * the same night raise two notifications rather than replacing one another.
 */
export function unavailableWhileRosteredNotification(input: {
  singerName: string;
  sessionId: string;
  dateISO: string;
}): Notification {
  return {
    title: "Someone has dropped out",
    body: `${input.singerName} is not available on ${formatSessionDate(input.dateISO)} and is on that roster. Somebody else will be needed.`,
    url: `/roster/${input.sessionId}/assign`,
    tag: `unavailable-${input.sessionId}-${input.singerName}`,
    alert: true,
  };
}
