"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type SungBhajan = {
  title: string;
  bhajanId: string | null;
  times: number;
  /** Most recent first, ISO dates. */
  dates: string[];
  /** Distinct confirmed pitches, most recent first. */
  pitches: string[];
};

/**
 * "Has this singer sung it, how many times, and when."
 *
 * Filters in the browser over the singer's whole history rather than querying
 * per keystroke: one singer has at most a few hundred rows, so the entire set
 * is already on the page and a round trip per character would be slower and
 * noisier for no benefit.
 *
 * A search that matches nothing says so explicitly. "No results" on a page
 * about one person is ambiguous — it could mean the bhajan does not exist, or
 * that they have never sung it, and those are different answers.
 */
export function SungBhajanSearch({
  singerName,
  sung,
}: {
  singerName: string;
  sung: SungBhajan[];
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return sung;
    return sung.filter((s) => s.title.toLowerCase().includes(q));
  }, [q, sung]);

  const shown = q ? matches : matches.slice(0, 12);

  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor="sung-search" className="sr-only">
          Search {singerName}&rsquo;s bhajans
        </label>
        <input
          id="sung-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search a bhajan — has ${singerName} sung it?`}
          className="h-10 w-full rounded-[12px] border border-rule-surface bg-field px-3 text-sm"
        />
      </div>

      {q && matches.length === 0 ? (
        <p className="rounded-[10px] border border-rule-surface bg-panel px-3 py-2 text-sm text-on-surface-muted">
          <strong className="text-on-surface">{singerName}</strong> has not sung anything
          matching &ldquo;{query}&rdquo;. This searches their own history only, so the bhajan
          may still exist in the masterlist.
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="grid gap-1.5">
          {shown.map((s) => (
            <li
              key={`${s.title}-${s.bhajanId ?? ""}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[10px] border border-rule-surface bg-panel px-3 py-2"
            >
              <span className="min-w-0 text-sm font-medium">
                {s.bhajanId ? (
                  <Link href={`/bhajans/${s.bhajanId}`} className="underline-offset-2 hover:underline">
                    {s.title}
                  </Link>
                ) : (
                  s.title
                )}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-3 text-xs text-on-surface-muted">
                <span>
                  <strong className="text-on-surface">{s.times}×</strong>
                  {s.times > 1 ? " sung" : " sung"}
                </span>
                <span title={s.dates.join(", ")}>
                  last {formatDate(s.dates[0])}
                  {s.dates.length > 1 ? ` · first ${formatDate(s.dates[s.dates.length - 1])}` : ""}
                </span>
                {s.pitches.length > 0 ? (
                  <span className="font-mono">{s.pitches.slice(0, 2).join(" · ")}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {!q && sung.length > shown.length ? (
        <p className="text-xs text-on-surface-muted">
          Showing the {shown.length} most sung of {sung.length}. Search to find any of them.
        </p>
      ) : null}

      {sung.length === 0 ? (
        <p className="text-sm text-on-surface-muted">Nothing recorded yet.</p>
      ) : null}
    </div>
  );
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { year: "numeric", month: "short", timeZone: "UTC" });
}
