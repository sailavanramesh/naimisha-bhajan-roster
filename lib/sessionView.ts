/**
 * lib/sessionView.ts — where a person should land when they open a session.
 *
 * Pure. No Prisma, no cookies, no router.
 *
 * Two different things decide this and they are easy to confuse:
 *
 *   - `Singer.defaultRosterView` is a PREFERENCE — calendar or list, how
 *     somebody likes to see the roster.
 *   - `Singer.soundEngineer` / `Singer.micCoordinator` are JOBS — "you run the
 *     desk", which says what somebody came to a session to DO.
 *
 * The job wins, because somebody who came to run the sound desk did not come to
 * read the roster grid. The preference is untouched and still decides on every
 * screen that is not a session.
 *
 * BOTH ARE NOW FACTS ABOUT THE PERSON. The jobs used to be SessionCrew, a row
 * per person per session, allocated on each programme under "Who is running
 * it" — Sailavan, 2026-08-18: "if we add the roles of mic coordinator and sound
 * engineer at the admin level we can remove who is running it from all views".
 * The same three people did it every week and were re-entered every week, so
 * the per-night precision bought nothing and cost a card on every screen.
 *
 * A pure function so the rule can be read in one place and tested without a
 * database, rather than being spread across three route handlers as redirects.
 */

export type SessionJob = "soundEngineer" | "micCoordinator";
export type SessionFormat = "bhajans" | "program";

export type SessionViewContext = {
  sessionId: string;
  format: SessionFormat;
  /** The jobs this person holds at the centre. Usually none. */
  jobs: readonly SessionJob[];
};

/**
 * The jobs a person holds, from the two columns on their singer row.
 *
 * One place that turns the booleans into the list everything else reads, so the
 * order — sound engineer first, which decides who wins in `resolveSessionView`
 * — is stated once rather than at each call site.
 */
export function jobsOf(
  singer: { soundEngineer?: boolean | null; micCoordinator?: boolean | null } | null | undefined,
): SessionJob[] {
  if (!singer) return [];
  const jobs: SessionJob[] = [];
  if (singer.soundEngineer) jobs.push("soundEngineer");
  if (singer.micCoordinator) jobs.push("micCoordinator");
  return jobs;
}

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

/**
 * Is this person one of the two who run the sound?
 *
 * The gate on DESK SETUP — which desk a session is on, taking its strips again,
 * and the channel list. Sailavan: those "shouldn't be available to anyone but
 * editors and people marked as sound engineers or mic coordinators".
 *
 * One question now, where there used to be two that were easy to confuse: a
 * per-night SessionCrew job and a standing `canRunSound` grant. They were the
 * same three people, so they collapsed into the two roles on the singer.
 *
 * An editor may do it regardless, as with everything else on the page.
 */
export function runsSound(jobs: readonly SessionJob[]): boolean {
  return jobs.some((job) => job === "soundEngineer" || job === "micCoordinator");
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
  return job === "soundEngineer" ? "You are on sound." : "You are on mics.";
}
