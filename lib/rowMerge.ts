/**
 * lib/rowMerge.ts — two people saving the same session at once.
 *
 * Pure. No Prisma import, because this decides whether a `confirmedPitch`
 * survives and that is the most valuable column in the database (CLAUDE.md
 * rule 6). A rule like that belongs in a tested function, not inside a
 * transaction.
 *
 * ## Why this exists
 *
 * The save was all-or-nothing: every row carried the `updatedAt` it had when
 * the page loaded, and if ANY row had moved on the whole save was refused.
 * Refusing was the right instinct — a pitch quietly lost is not recoverable —
 * but it was too blunt. Sailavan, after the first long Sunday run, 2026-08-23:
 *
 *   "we will have situations where multiple people may be in the app and we
 *   need to save, so maybe a summary of what changes exist in parallel instead
 *   of the error and allowing the person to save with everyone's changes or
 *   something like that, otherwise this is an issue in the live."
 *
 * ## What "everyone's changes" means, exactly
 *
 * THREE versions of every row, not two, which is the whole trick:
 *
 *   base    what this browser loaded
 *   mine    what this browser is sending
 *   theirs  what is in the database now
 *
 * With `base` you can tell the difference between "I set this pitch" and "I am
 * echoing back the pitch I was shown". Without it, every field a browser sends
 * looks like an assertion, which is why last-writer-wins loses data and why
 * refusing everything was the only safe alternative.
 *
 * So, per FIELD:
 *
 *   mine === base            I did not touch it. Take theirs.
 *   theirs === base          they did not touch it. Take mine.
 *   both moved, same value   agreement. No conflict.
 *   both moved, differently  a real clash. Reported, never guessed.
 *
 * Two people working on different rows — the common case, a coordinator on a
 * laptop and a singer on a phone — now both save. Two people on the same row
 * but different fields likewise. Only a genuine disagreement about one field
 * stops anything, and then the answer names the row and the field rather than
 * saying somebody, somewhere, saved something.
 */

/** The fields a person can change on a roster row. */
export type MergeableRow = {
  singerId: string;
  bhajanId: string | null;
  bhajanTitle: string | null;
  festivalBhajanTitle: string | null;
  confirmedPitch: string | null;
  alternativeTablaPitch: string | null;
};

export const MERGEABLE_FIELDS = [
  "singerId",
  "bhajanId",
  "bhajanTitle",
  "festivalBhajanTitle",
  "confirmedPitch",
  "alternativeTablaPitch",
] as const satisfies readonly (keyof MergeableRow)[];

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

/** One field two people changed to two different things. */
export type FieldClash = {
  field: MergeableField;
  /** What this browser is trying to set. */
  mine: string | null;
  /** What is in the database now. */
  theirs: string | null;
};

export type RowMerge = {
  /** The row to write: mine where I moved it, theirs where they did. */
  merged: MergeableRow;
  /** Empty when the two sets of edits did not overlap. */
  clashes: FieldClash[];
  /** True when this save has something of its own to write to this row. */
  changedByMe: boolean;
};

/** Null, undefined and "" are the same absence; trailing spaces are not a change. */
function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

/**
 * Merge one row three ways.
 *
 * `base` may be missing — an older client, or a row this browser never loaded.
 * Without it nothing can be attributed, so every field this browser sends would
 * have to be treated as an assertion. That is the unsafe reading, so instead
 * every difference is reported as a clash and a person decides.
 */
export function mergeRow(
  base: Partial<MergeableRow> | null | undefined,
  mine: MergeableRow,
  theirs: MergeableRow,
): RowMerge {
  const merged: MergeableRow = { ...theirs };
  const clashes: FieldClash[] = [];
  let changedByMe = false;

  for (const field of MERGEABLE_FIELDS) {
    const b = base ? base[field] : undefined;
    const m = mine[field];
    const t = theirs[field];

    if (same(m, t)) continue; // Already agreed, whoever got there first.

    if (!base) {
      // Nothing to attribute the difference to. Ask rather than guess.
      clashes.push({ field, mine: m ?? null, theirs: t ?? null });
      continue;
    }

    const iMovedIt = !same(m, b);
    const theyMovedIt = !same(t, b);

    if (iMovedIt && theyMovedIt) {
      clashes.push({ field, mine: m ?? null, theirs: t ?? null });
      continue;
    }
    if (iMovedIt) {
      (merged[field] as string | null) = m;
      changedByMe = true;
      continue;
    }
    // Only they moved it, so theirs is already in `merged` — nothing to do.
  }

  return { merged, clashes, changedByMe };
}

/** How a field is named when explaining a clash to somebody. */
export const FIELD_LABELS: Record<MergeableField, string> = {
  singerId: "the singer",
  bhajanId: "the bhajan",
  bhajanTitle: "the bhajan",
  festivalBhajanTitle: "the bhajan",
  confirmedPitch: "the pitch",
  alternativeTablaPitch: "the tabla pitch",
};

/** One row somebody else changed at the same time, ready to print. */
export type RowConflict = {
  /** 1-based, as the grid numbers them. */
  position: number;
  /** Whose row it is, for finding it on screen. */
  singerName: string | null;
  fields: FieldClash[];
};

/**
 * The summary a person reads instead of "somebody else saved this session".
 *
 * Names the row and the field, and says what each side holds. A save that has
 * to be redone is a nuisance; a save refused with no idea what to change is the
 * thing that makes people stop trusting the app mid-session.
 */
export function describeConflicts(conflicts: readonly RowConflict[]): string {
  if (conflicts.length === 0) return "";

  const rows = conflicts.map((c) => {
    const parts = c.fields.map((f) => {
      const label = FIELD_LABELS[f.field];
      const theirs = (f.theirs ?? "").trim() || "nothing";
      const mine = (f.mine ?? "").trim() || "nothing";
      // Ids are not worth printing at somebody; the field name carries it.
      const values =
        f.field === "singerId" || f.field === "bhajanId"
          ? ""
          : ` — theirs "${theirs}", yours "${mine}"`;
      return `${label}${values}`;
    });
    const nameOf = c.singerName?.trim() || "an empty row";
    return `row ${c.position} (${nameOf}): ${[...new Set(parts)].join("; ")}`;
  });

  const count = conflicts.length;
  return (
    `Somebody else changed ${count === 1 ? "the same thing" : "the same things"} while you had ` +
    `this open, so ${count === 1 ? "that row was" : "those rows were"} left alone — ` +
    `${rows.join(", and ")}. Everything else you changed has been saved. Reload to see ` +
    `theirs, then re-apply yours.`
  );
}
