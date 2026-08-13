/**
 * lib/sessionView.ts — where a person should land when they open a session.
 *
 * Pure. No Prisma, no cookies, no router.
 *
 * Two different things decide this and they are easy to confuse:
 *
 *   - `Singer.defaultRosterView` is a STANDING PREFERENCE — calendar or list,
 *     how somebody likes to see the roster, set once and true everywhere.
 *   - `SessionCrew` is a JOB ON ONE NIGHT — "you are on the desk for this
 *     session", true for that session and nothing else.
 *
 * The job wins on the session it applies to, because somebody who came to run
 * the sound desk did not come to read the roster grid. It wins for that session
 * only; the preference is untouched and still decides everywhere else.
 *
 * A pure function so the rule can be read in one place and tested without a
 * database, rather than being spread across three route handlers as redirects.
 */

export type SessionJob = "soundEngineer" | "micCoordinator";
export type SessionFormat = "bhajans" | "program";

export type SessionViewContext = {
  sessionId: string;
  format: SessionFormat;
  /** The jobs this person holds on THIS session. Usually none. */
  jobs: readonly SessionJob[];
};

export type SessionView = {
  /** Where to send them. */
  href: string;
  /**
   * Whether this is the job view rather than the ordinary page. The page uses
   * it to offer the way back — landing somewhere you did not ask for is only
   * helpful if leaving is obvious.
   */
  forJob: SessionJob | null;
};

/** Everything the desk jobs care about, in one place. */
const DESK_JOBS: readonly SessionJob[] = ["soundEngineer", "micCoordinator"];

/**
 * The ordinary page for a session — the roster grid, or the program's running
 * order.
 */
export function sessionHref(sessionId: string, format: SessionFormat): string {
  return format === "program" ? `/program/${sessionId}` : `/roster/${sessionId}`;
}

/**
 * The screen for a job, or null when the app has none for it yet.
 *
 * The bhajan side already has the live board, which is what the sound desk
 * reads during a session. The program desk view arrives with the channel work;
 * until then a program falls back to the running order rather than routing
 * somebody to a page that does not exist.
 */
export function jobHref(
  sessionId: string,
  format: SessionFormat,
  job: SessionJob,
): string | null {
  if (!DESK_JOBS.includes(job)) return null;
  return format === "program" ? null : `/roster/${sessionId}/live`;
}

/**
 * Where this person lands.
 *
 * Order matters: the first job with a view wins, so listing soundEngineer first
 * means the person running the desk gets the desk even if they are also down as
 * mic coordinator.
 */
export function resolveSessionView(context: SessionViewContext): SessionView {
  for (const job of DESK_JOBS) {
    if (!context.jobs.includes(job)) continue;
    const href = jobHref(context.sessionId, context.format, job);
    if (href) return { href, forJob: job };
  }
  return { href: sessionHref(context.sessionId, context.format), forJob: null };
}

export const JOB_LABELS: Record<SessionJob, string> = {
  soundEngineer: "Sound engineer",
  micCoordinator: "Mic coordinator",
};

/**
 * What the banner says on a job view. Written as the reason they are here,
 * because the useful thing to know is why the screen is different.
 */
export function jobBanner(job: SessionJob): string {
  return job === "soundEngineer"
    ? "You are on sound for this session."
    : "You are on mics for this session.";
}
