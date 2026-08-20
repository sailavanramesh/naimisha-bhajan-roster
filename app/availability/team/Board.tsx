"use client";

/**
 * The availability board, with the free cells selectable.
 *
 * Sailavan: "from who's around, there should be a way to select the cells that
 * are not 'cannot sing' and create or roster those ppl to a session from there
 * for that date."
 *
 * ## Selection is per date, deliberately
 *
 * A cell is a person AND a night, so a selection spanning two columns would
 * mean two different rosters and there is no sensible single button for that.
 * Picking a cell in another column therefore starts a fresh selection rather
 * than adding to the old one — and it says so, so nobody loses a careful set of
 * ticks without being told why.
 *
 * A cell for somebody who cannot sing is not selectable at all. That is the one
 * place in the app where the away state is a hard stop rather than a
 * confirmation, and it is safe to be: this button creates a roster from
 * scratch, so there is no coordinator mid-decision about a particular person,
 * and everything the two-press path allows is still available on the assign
 * page afterwards.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/components/ui";
import { columnLabel, monthLabel, type BoardColumn } from "@/lib/availabilityBoard";
import { rosterFromBoard } from "./actions";

export type BoardRowView = {
  singerId: string;
  name: string;
  gender: string | null;
  awayOn: string[];
};

export function Board({
  columns,
  groups,
  rows,
  awayPerDate,
  canRoster,
}: {
  columns: BoardColumn[];
  groups: { month: string; columns: BoardColumn[] }[];
  rows: BoardRowView[];
  awayPerDate: Record<string, number>;
  canRoster: boolean;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [switched, setSwitched] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(singerId: string, cellDate: string) {
    setError(null);
    if (date !== cellDate) {
      // A new night. Say so rather than silently dropping the old ticks.
      setSwitched(date !== null && picked.size > 0);
      setDate(cellDate);
      setPicked(new Set([singerId]));
      return;
    }
    setSwitched(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(singerId)) next.delete(singerId);
      else next.add(singerId);
      if (next.size === 0) setDate(null);
      return next;
    });
  }

  function roster() {
    if (!date || picked.size === 0) return;
    setError(null);
    startTransition(async () => {
      // Only returns on refusal; success redirects to the assign page.
      const r = await rosterFromBoard({ date, singerIds: [...picked] });
      if (r && !r.ok) setError(r.error);
    });
  }

  const chosen = rows.filter((r) => picked.has(r.singerId));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-20 min-w-[9rem] border-b border-rule-surface bg-panel px-3 py-2 text-left text-xs font-semibold"
                rowSpan={2}
              >
                Singer
              </th>
              {groups.map((g) => (
                <th
                  key={g.month}
                  colSpan={g.columns.length}
                  className="border-b border-l border-rule-surface px-2 py-1 text-center text-[11px] font-semibold text-on-surface-muted"
                >
                  {monthLabel(g.month)}
                </th>
              ))}
              <th
                className="border-b border-l border-rule-surface px-2 py-2 text-center text-[11px] font-semibold text-on-surface-muted"
                rowSpan={2}
              >
                away
              </th>
            </tr>
            <tr>
              {columns.map((c) => {
                const l = columnLabel(c.date);
                return (
                  <th
                    key={c.date}
                    title={`${c.date}${c.scheduled ? " — session in the diary" : " — no session yet"}`}
                    className={cn(
                      "w-9 border-b border-rule-surface px-0 py-1 text-center text-[10px] font-normal leading-tight",
                      c.scheduled ? "font-semibold" : "text-on-surface-muted",
                      date === c.date ? "bg-brass/[0.10]" : "",
                    )}
                  >
                    <div>{l.weekday}</div>
                    <div className="tabular-nums">{l.day}</div>
                    <div aria-hidden className="text-brass">
                      {c.scheduled ? "•" : " "}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const away = new Set(r.awayOn);
              return (
                <tr key={r.singerId} className="odd:bg-surface-sunk/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-rule-surface bg-panel px-3 py-1.5 text-left font-normal"
                  >
                    <Link href={`/singers/${r.singerId}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </th>
                  {columns.map((c) => {
                    const isAway = away.has(c.date);
                    const isPicked = date === c.date && picked.has(r.singerId);
                    const label = isAway
                      ? `${r.name} cannot sing on ${c.date}`
                      : canRoster
                        ? `${isPicked ? "Unpick" : "Pick"} ${r.name} for ${c.date}`
                        : `${r.name} is available on ${c.date}`;
                    return (
                      <td
                        key={c.date}
                        className={cn(
                          "border-b border-rule-surface p-0 text-center align-middle",
                          date === c.date ? "bg-brass/[0.06]" : "",
                        )}
                      >
                        {isAway || !canRoster ? (
                          <span
                            title={label}
                            className={cn(
                              "mx-auto block h-5 w-5 rounded-[6px]",
                              isAway ? "bg-kumkum/70" : "bg-transparent",
                            )}
                          >
                            <span className="sr-only">{label}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggle(r.singerId, c.date)}
                            title={label}
                            aria-pressed={isPicked}
                            className={cn(
                              "mx-auto block h-5 w-5 rounded-[6px] border transition",
                              isPicked
                                ? "border-transparent bg-brass"
                                : "border-transparent hover:border-brass/50 hover:bg-brass/[0.12]",
                            )}
                          >
                            <span className="sr-only">{label}</span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-rule-surface px-2 py-1.5 text-center text-xs tabular-nums text-on-surface-muted">
                    {r.awayOn.length || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-panel px-3 py-1.5 text-left text-xs font-semibold"
              >
                away that night
              </th>
              {columns.map((c) => {
                const n = awayPerDate[c.date] ?? 0;
                return (
                  <td
                    key={c.date}
                    className={cn(
                      "px-0 py-1.5 text-center text-xs tabular-nums",
                      n === 0 ? "text-on-surface-muted" : "font-semibold",
                    )}
                  >
                    {n || ""}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {canRoster && date && picked.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-brass/50 bg-brass/[0.06] px-3 py-2">
          <span className="text-sm">
            <strong className="font-semibold">{chosen.map((c) => c.name).join(", ")}</strong> for{" "}
            {new Intl.DateTimeFormat("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(new Date(`${date}T12:00:00.000Z`))}
          </span>
          <button
            type="button"
            onClick={roster}
            disabled={pending}
            className="inline-flex h-8 items-center rounded-[10px] border border-transparent px-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: "rgb(var(--brass))", color: "rgb(var(--brass-ink))" }}
          >
            {pending
              ? "rostering…"
              : columns.find((c) => c.date === date)?.scheduled
                ? `Add ${picked.size} to that session`
                : `Create the session with ${picked.size}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setPicked(new Set());
              setDate(null);
              setError(null);
            }}
            className="text-[11px] text-on-surface-muted underline hover:text-on-surface"
          >
            clear
          </button>
          <span className="text-[11px] text-on-surface-muted">
            Bhajans are chosen afterwards, on the assign page.
          </span>
        </div>
      ) : null}

      {switched ? (
        <p className="mt-2 text-[11px] text-on-surface-muted">
          Started a new selection — a night at a time, since each one is its own roster.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-sm text-kumkum">{error}</p> : null}
    </>
  );
}
