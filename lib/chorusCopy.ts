/**
 * lib/chorusCopy.ts — copying one bhajan's chorus mics down the session.
 *
 * Pure. No Prisma, no I/O.
 *
 * The chorus is usually the same two or three people all evening, each on the
 * cushion they picked up at the start, and setting that per bhajan is the same
 * handful of taps repeated down the column. Sailavan asked for a copy down so
 * it does not have to be done by hand every time.
 *
 * IT ONLY EVER FILLS EMPTY ONES. A bhajan that already has chorus mics is left
 * exactly as it is and reported as skipped, which is what makes this safe to
 * press: there is no confirm step and no undo, because there is nothing to
 * undo. It is the same instinct as the pitch chip next door — the app offers,
 * and never writes over an answer somebody has already given.
 *
 * "Below" is by POSITION, not by the order rows happen to arrive in: a session
 * is a running order, copying down means down the running order, and a row
 * dragged to a new place has already changed its position.
 */

export type ChorusCopySource = {
  singerId: string;
  cushion: string | null;
};

export type ChorusCopyTarget = {
  slotId: string;
  position: number;
  /** How many chorus mics it already has. Anything above zero is left alone. */
  micCount: number;
};

export type ChorusCopyPlan = {
  /** Slots that will be filled, in running order. */
  fill: string[];
  /** Slots left alone because somebody has already answered them. */
  skip: string[];
};

/**
 * Which bhajans below this one should take its chorus.
 *
 * Returns ids rather than rows so the caller does the writing — this decides,
 * and nothing here can touch a database.
 */
export function planChorusCopy({
  fromPosition,
  targets,
}: {
  fromPosition: number;
  targets: readonly ChorusCopyTarget[];
}): ChorusCopyPlan {
  const below = targets
    .filter((t) => t.position > fromPosition)
    .slice()
    .sort((a, b) => a.position - b.position);

  return {
    fill: below.filter((t) => t.micCount === 0).map((t) => t.slotId),
    skip: below.filter((t) => t.micCount > 0).map((t) => t.slotId),
  };
}

/**
 * What to tell somebody who just pressed it.
 *
 * Written out here because the interesting case is the one that LOOKS like
 * nothing happened: every bhajan below already had its own chorus, so the press
 * was correct, safe and completely invisible. Saying so is the difference
 * between a considered no-op and a button that seems broken.
 */
export function describeChorusCopy(plan: ChorusCopyPlan): string {
  const { fill, skip } = plan;

  if (fill.length === 0 && skip.length === 0) return "No bhajans below this one.";
  if (fill.length === 0) {
    return skip.length === 1
      ? "The bhajan below already has its own chorus mics."
      : `All ${skip.length} bhajans below already have their own chorus mics.`;
  }

  const copied = `Copied to ${fill.length} bhajan${fill.length === 1 ? "" : "s"}.`;
  if (skip.length === 0) return copied;
  return `${copied} Left ${skip.length} that already had mics.`;
}
