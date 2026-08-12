/**
 * lib/fairnessFilters.ts — what slice of history "fairness" is measured over.
 *
 * Pure. No Prisma import.
 *
 * The dashboard used to offer four window lengths and nothing else, which was
 * enough when every session was an ordinary Thursday evening. Sailavan,
 * 2026-08-12: "now that there will be more sessions over a greater time period,
 * the fairness evaluation must allow for more filters like session type, date
 * ranges, etc."
 *
 * The reason it matters is not tidiness. Fairness compares people against each
 * other, and mixing kinds of session makes the comparison meaningless: a
 * singer who does every festival and no weekdays looks over-used against one
 * who does the reverse, when neither is. Being able to ask "who is carrying
 * the routine Thursdays?" separately from "who does the festivals?" is the
 * whole point.
 */

export type PartOfDay = "any" | "morning" | "evening";

export type FairnessFilters = {
  /** Inclusive, "YYYY-MM-DD". */
  fromISO: string;
  toISO: string;
  /** A category id, or null for every kind. */
  categoryId: string | null;
  partOfDay: PartOfDay;
  /** The preset that produced the range, when one did. */
  presetDays: number | null;
};

export const PRESETS = [
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "1 year" },
  { days: 3650, label: "All time" },
] as const;

const DEFAULT_DAYS = 365;

/** Morning is before noon. Sessions with no time are the usual evening. */
export const MORNING_BEFORE = "12:00";

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the filters off a query string.
 *
 * Explicit dates win over a preset: somebody who has typed a range means it,
 * and silently snapping back to "last 365 days" because a stale `days=` is
 * still in the URL is the kind of thing that makes a dashboard untrustworthy.
 *
 * A backwards range is swapped rather than rejected. It is obviously a typo
 * and there is exactly one thing it can have meant.
 */
export function parseFilters(
  sp: { days?: string; from?: string; to?: string; cat?: string; when?: string },
  todayISO: string,
): FairnessFilters {
  const from = sp.from && ISO.test(sp.from) ? sp.from : null;
  const to = sp.to && ISO.test(sp.to) ? sp.to : null;

  let fromISO: string;
  let toISO: string;
  let presetDays: number | null = null;

  if (from || to) {
    fromISO = from ?? addDaysISO(to!, -DEFAULT_DAYS);
    toISO = to ?? todayISO;
    if (fromISO > toISO) [fromISO, toISO] = [toISO, fromISO];
  } else {
    const days = Number(sp.days ?? DEFAULT_DAYS);
    presetDays = Number.isFinite(days) && days > 0 ? Math.round(days) : DEFAULT_DAYS;
    fromISO = addDaysISO(todayISO, -presetDays);
    toISO = todayISO;
  }

  const when = sp.when === "morning" || sp.when === "evening" ? sp.when : "any";

  return {
    fromISO,
    toISO,
    categoryId: sp.cat && sp.cat !== "all" ? sp.cat : null,
    partOfDay: when,
    presetDays,
  };
}

/** The filters as a query string, so links can change one and keep the rest. */
export function filtersToQuery(
  filters: FairnessFilters,
  override: Partial<{
    days: number | null;
    from: string | null;
    to: string | null;
    cat: string | null;
    when: PartOfDay;
  }> = {},
): string {
  const params = new URLSearchParams();

  const days = "days" in override ? override.days : filters.presetDays;
  const from = "from" in override ? override.from : filters.presetDays ? null : filters.fromISO;
  const to = "to" in override ? override.to : filters.presetDays ? null : filters.toISO;
  const cat = "cat" in override ? override.cat : filters.categoryId;
  const when = override.when ?? filters.partOfDay;

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (!from && !to && days) params.set("days", String(days));
  if (cat) params.set("cat", cat);
  if (when !== "any") params.set("when", when);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * The filters as a sentence, for the line under the heading.
 *
 * A dashboard that shows numbers without saying what they cover invites being
 * read as the whole picture — which, once these filters exist, it usually is
 * not.
 */
export function describeFilters(
  filters: FairnessFilters,
  categoryName: string | null,
  todayISO: string,
): string {
  const range =
    filters.presetDays === 3650
      ? "all time"
      : filters.presetDays
        ? `the last ${filters.presetDays} days`
        : `${filters.fromISO} to ${filters.toISO}${filters.toISO >= todayISO ? "" : ""}`;

  const parts = [range];
  if (categoryName) parts.push(categoryName.toLowerCase() + " sessions");
  if (filters.partOfDay === "morning") parts.push("mornings only");
  if (filters.partOfDay === "evening") parts.push("evenings only");
  return parts.join(" · ");
}
