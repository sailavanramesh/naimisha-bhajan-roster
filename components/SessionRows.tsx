import Link from "next/link";

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
 */
export function SessionRows({
  rows,
  total,
  emptyLabel = "Nothing rostered yet.",
}: {
  rows: SessionRow[];
  /** The real count, which may exceed the rows shown. */
  total: number;
  emptyLabel?: string;
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
            className="grid grid-cols-[6.5rem_1fr] items-baseline gap-x-2 gap-y-0 rounded-[8px] px-1.5 py-1 text-[13px] odd:bg-surface/60 sm:grid-cols-[7rem_1fr_auto]"
          >
            <span className="truncate font-medium">{r.singer}</span>
            <span className="truncate text-on-surface-muted">{r.bhajan ?? "no bhajan yet"}</span>
            {/*
              On a phone the pitch drops to its own line under the two names
              rather than squeezing a third column into 6rem — it is short,
              and a truncated pitch is worse than a wrapped one.
            */}
            <span className="col-span-2 font-mono text-[12px] text-on-surface-muted sm:col-span-1 sm:text-right">
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
