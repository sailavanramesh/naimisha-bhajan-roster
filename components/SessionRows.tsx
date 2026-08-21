import Link from "next/link";
import { Marked } from "@/components/Marked";

export type SessionRow = {
  singer: string;
  bhajan: string | null;
  pitch: string | null;
};

/**
 * A session's rows, at a glance.
 *
 * Shared by the calendar's day panel and the list view so the two agree. They
 * answer the same question — who is singing what, and at what pitch — and had
 * drifted into two different shapes: the list showed singer and bhajan in
 * columns, the calendar showed a single run-on sentence with neither aligned
 * nor a pitch in sight.
 *
 * Three columns: singer, bhajan, pitch. The pitch is the reason to look at a
 * past day at all, and it is the first thing wanted for a coming one.
 *
 * `query` marks what matched. The list already showed every session containing
 * a hit, which answers "which days" and then leaves you scanning a ten-row
 * session for the reason it is there.
 */
export function SessionRows({
  rows,
  total,
  emptyLabel = "Nothing rostered yet.",
  query,
}: {
  rows: SessionRow[];
  /** The real count, which may exceed the rows shown. */
  total: number;
  emptyLabel?: string;
  /** What was searched for, when these rows are search results. */
  query?: string | null;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-on-surface-muted">{emptyLabel}</p>;
  }

  return (
    <div className="grid gap-1">
      <ul className="grid gap-0.5">
        {rows.map((r, i) => (
          <li
            key={i}
            /*
              Three columns at every width, not two-plus-a-wrapped-line.
              
              The pitch used to drop under the names on a phone, which spent a
              whole extra line on eleven characters and made a four-row session
              eight rows tall. It sits on the right now and the bhajan gives up
              the space instead — this is a summary, and the session itself is
              one tap away.
            */
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded-[8px] px-1.5 py-1 text-[13px] odd:bg-surface/60 sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
          >
            <span className="truncate font-medium">
              <Marked text={r.singer} query={query} />
            </span>
            <span className="truncate text-on-surface-muted">
              {r.bhajan ? <Marked text={r.bhajan} query={query} /> : "no bhajan yet"}
            </span>
            {/* Never truncated and never wrapped: a half-read shruti is worse
                than no shruti. */}
            <span className="whitespace-nowrap text-right font-mono text-[11px] text-on-surface-muted sm:text-[12px]">
              {r.pitch ?? ""}
            </span>
          </li>
        ))}
      </ul>

      {total > rows.length ? (
        <p className="px-1.5 text-[11px] text-on-surface-muted">
          + {total - rows.length} more
        </p>
      ) : null}
    </div>
  );
}

/** The date heading and count that sit above the rows. */
export function SessionRowsHeader({
  href,
  label,
  total,
}: {
  href?: string;
  label: string;
  total: number;
}) {
  const count = total === 0 ? "nothing rostered" : `${total} row${total === 1 ? "" : "s"}`;
  const inner = (
    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="font-semibold">{label}</span>
      <span className="text-[11px] text-on-surface-muted">{count}</span>
    </span>
  );
  return href ? (
    <Link href={href} className="block underline-offset-2 hover:underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// Re-exported: this is where it used to live, and app/roster/page.tsx
// still reaches for it alongside SessionRows.
export { Marked };
