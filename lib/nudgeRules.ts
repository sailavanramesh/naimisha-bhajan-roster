import { NUDGE_HOUR, NUDGE_FINAL_HOUR, NUDGE_LATEST_HOUR, type NoticeKind } from "./notify";

/**
 * lib/nudgeRules.ts — when the day-of reminders go out, per session.
 *
 * Pure. No Prisma import.
 *
 * The hours used to be constants, on the assumption every session is in the
 * evening. Sailavan, 2026-08-12: "the majority of sessions are PM, but
 * sometimes they can be AM" — and a 3pm reminder for a session that finished
 * at noon is worse than no reminder at all, because it teaches people the app
 * is wrong about time.
 *
 * So the hours are data now, resolved most-specific-first:
 *
 *   session   this one festival, this one Sunday morning
 *   weekday   "Sundays here run in the morning"
 *   default   3pm, then 5pm — what everything did before
 *
 * A scope that is present and disabled STOPS resolution: switching Sundays off
 * has to mean off, not "fall through to the default and send anyway". That is
 * the whole reason `enabled` sits on the rule rather than being represented by
 * the rule's absence.
 */

export type NudgeRule = {
  firstHour: number;
  /** Null means there is only ever one reminder. */
  finalHour: number | null;
  stopAfterHour: number;
  enabled: boolean;
};

export type ScopedRule = NudgeRule & {
  scope: "default" | "weekday" | "session";
  weekday: number | null;
  sessionId: string | null;
};

/** What every session did before any of this was configurable. */
export const BUILT_IN_RULE: NudgeRule = {
  firstHour: NUDGE_HOUR,
  finalHour: NUDGE_FINAL_HOUR,
  stopAfterHour: NUDGE_LATEST_HOUR,
  enabled: true,
};

/**
 * The rule that governs one session.
 *
 * `weekday` is 0=Sunday…6=Saturday, in Melbourne — the same day the session is
 * dated, not the day the server happens to be having.
 */
export function resolveRule(
  rules: readonly ScopedRule[],
  session: { id: string; weekday: number },
): NudgeRule {
  const forSession = rules.find((r) => r.scope === "session" && r.sessionId === session.id);
  if (forSession) return strip(forSession);

  const forWeekday = rules.find((r) => r.scope === "weekday" && r.weekday === session.weekday);
  if (forWeekday) return strip(forWeekday);

  const fallback = rules.find((r) => r.scope === "default");
  return fallback ? strip(fallback) : BUILT_IN_RULE;
}

function strip(r: ScopedRule): NudgeRule {
  return {
    firstHour: r.firstHour,
    finalHour: r.finalHour,
    stopAfterHour: r.stopAfterHour,
    enabled: r.enabled,
  };
}

/**
 * Which nudge, if any, is owed right now under a given rule.
 *
 * The same shape as the old `dueNudge`, with the hours passed in. Sailavan
 * chose that an owner editing a rule must not resend anything already sent —
 * so this only ever looks forward, and `sent` is what makes that true.
 */
export function dueNudgeUnder(
  rule: NudgeRule,
  melbourneHour: number,
  sent: readonly NoticeKind[],
): "nudge" | "nudge_final" | null {
  if (!rule.enabled) return null;
  if (melbourneHour < rule.firstHour || melbourneHour >= rule.stopAfterHour) return null;

  if (rule.finalHour !== null && melbourneHour >= rule.finalHour) {
    return sent.includes("nudge_final") ? null : "nudge_final";
  }
  return sent.includes("nudge") ? null : "nudge";
}

/**
 * A rule in words, for the Admin screen.
 *
 * Hours in boxes are the sort of thing that gets set wrong once and never
 * noticed again, so every row says back what it will actually do.
 */
export function describeRule(rule: NudgeRule): string {
  if (!rule.enabled) return "No reminders at all.";
  const first = `First reminder ${clock(rule.firstHour)}`;
  const final =
    rule.finalHour === null ? ", and no second one" : `, last one ${clock(rule.finalHour)}`;
  return `${first}${final}. Nothing after ${clock(rule.stopAfterHour)}.`;
}

export function clock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/**
 * Whether a rule is coherent enough to save.
 *
 * Returns an error message, or null. Checked here rather than only in the form
 * so the action cannot be talked into a rule that can never fire — "first
 * reminder 6pm, stop after 5pm" would simply go quiet, and the owner would
 * have no way of telling that from a bug.
 */
export function ruleProblem(rule: NudgeRule): string | null {
  const inRange = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
  if (!inRange(rule.firstHour)) return "The first reminder needs an hour between 0 and 23.";
  if (rule.finalHour !== null && !inRange(rule.finalHour)) {
    return "The last reminder needs an hour between 0 and 23.";
  }
  if (!inRange(rule.stopAfterHour)) return "The stop hour needs to be between 0 and 23.";
  if (rule.finalHour !== null && rule.finalHour <= rule.firstHour) {
    return "The last reminder has to come after the first one.";
  }
  if (rule.stopAfterHour <= rule.firstHour) {
    return "Nothing would ever send: the stop hour is at or before the first reminder.";
  }
  if (rule.finalHour !== null && rule.stopAfterHour <= rule.finalHour) {
    return "The last reminder would never send: it is at or after the stop hour.";
  }
  return null;
}

/** Melbourne weekday of a session date, 0=Sunday. */
export function weekdayOfISO(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00.000Z`).getUTCDay();
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
