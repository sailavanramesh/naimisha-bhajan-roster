"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DayInfo = Record<string, { sessionId: string; entries: number }>;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoFromUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseMonthKey(k: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(k);
  if (!m) return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function parseISODate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function startOfWeekMondayUTC(d: Date) {
  const day = (d.getUTCDay() + 6) % 7; // Monday=0
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - day);
  return out;
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthExclusiveUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function clampHeat(entries: number) {
  // Convert entry count -> subtle “heat” (opacity/width), no number badge.
  if (entries <= 0) return { show: false, cls: "" };
  if (entries === 1) return { show: true, cls: "opacity-30 w-2/12" };
  if (entries === 2) return { show: true, cls: "opacity-45 w-3/12" };
  if (entries <= 4) return { show: true, cls: "opacity-60 w-5/12" };
  if (entries <= 7) return { show: true, cls: "opacity-80 w-8/12" };
  return { show: true, cls: "opacity-100 w-11/12" };
}

export function RosterCalendarClient(props: {
  initialMonth: string; // YYYY-MM
  initialSelected: string; // YYYY-MM-DD
  dayInfo: DayInfo;
}) {
  const router = useRouter();

  const [month, setMonth] = useState(() => parseMonthKey(props.initialMonth));
  const [selectedISO, setSelectedISO] = useState(props.initialSelected);

  const selectedDate = useMemo(() => parseISODate(selectedISO), [selectedISO]);
  const selectedInfo = props.dayInfo[selectedISO] ?? null;

  function pushParams(next: { m?: string; d?: string }) {
    const m = next.m ?? monthKey(month);
    const d = next.d ?? selectedISO;
    router.push(`/roster?m=${encodeURIComponent(m)}&d=${encodeURIComponent(d)}`, { scroll: false });
  }

  // Desktop month grid range (Mon..Sun)
  const grid = useMemo(() => {
    const mStart = startOfMonthUTC(month);
    const gridStart = startOfWeekMondayUTC(mStart);
    const days: Array<{ iso: string; d: Date; inMonth: boolean; info?: { sessionId: string; entries: number } | null }> =
      [];
    for (let i = 0; i < 42; i++) {
      const d = addDaysUTC(gridStart, i);
      const iso = isoFromUTC(d);
      const inMonth = d >= mStart && d < endOfMonthExclusiveUTC(month);
      days.push({ iso, d, inMonth, info: props.dayInfo[iso] ?? null });
    }
    return days;
  }, [month, props.dayInfo]);

  // Mobile week strip = week of selected day
  const week = useMemo(() => {
    const wStart = startOfWeekMondayUTC(selectedDate);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDaysUTC(wStart, i);
      const iso = isoFromUTC(d);
      return { iso, d, info: props.dayInfo[iso] ?? null };
    });
  }, [selectedDate, props.dayInfo]);

  function selectDay(iso: string) {
    setSelectedISO(iso);
    // Keep month synced on desktop when selecting an out-of-month day (rare, but nice)
    const d = parseISODate(iso);
    const m = startOfMonthUTC(d);
    setMonth(m);
    pushParams({ m: monthKey(m), d: iso });
  }

  function gotoToday() {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const iso = isoFromUTC(todayUTC);
    const m = startOfMonthUTC(todayUTC);
    setMonth(m);
    setSelectedISO(iso);
    pushParams({ m: monthKey(m), d: iso });
  }

  function prevMonth() {
    const m = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
    setMonth(m);
    pushParams({ m: monthKey(m) });
  }

  function nextMonth() {
    const m = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    setMonth(m);
    pushParams({ m: monthKey(m) });
  }

  function prevWeek() {
    const iso = isoFromUTC(addDaysUTC(selectedDate, -7));
    selectDay(iso);
  }

  function nextWeek() {
    const iso = isoFromUTC(addDaysUTC(selectedDate, 7));
    selectDay(iso);
  }

  const monthLabel = useMemo(() => {
    return month.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  }, [month]);

  const selectedLabel = useMemo(() => {
    return selectedDate.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }, [selectedDate]);

  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dowShort = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="grid gap-4">
      {/* MOBILE: week strip */}
      <div className="md:hidden rounded-2xl border bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">{selectedLabel}</div>
            <div className="text-xs text-gray-600">Week strip (mobile). Tap a day.</div>
          </div>
          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            onClick={gotoToday}
          >
            Today
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={prevWeek}>
            Prev
          </button>

          <div className="flex-1 overflow-x-auto">
            <div className="flex min-w-max gap-2 px-1">
              {week.map((x, idx) => {
                const isSel = x.iso === selectedISO;
                const heat = clampHeat(x.info?.entries ?? 0);
                return (
                  <button
                    key={x.iso}
                    type="button"
                    onClick={() => selectDay(x.iso)}
                    className={[
                      "relative w-[52px] shrink-0 rounded-2xl border px-2 py-2 text-left",
                      isSel ? "border-violet-400 ring-2 ring-violet-200" : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <div className="text-[11px] text-gray-500">{dowShort[idx]}</div>
                    <div className="text-sm font-semibold">{x.d.getUTCDate()}</div>
                    {heat.show ? (
                      <div className="mt-2 h-1 w-full rounded-full bg-gray-100">
                        <div className={`h-1 rounded-full bg-violet-600 ${heat.cls}`} />
                      </div>
                    ) : (
                      <div className="mt-2 h-1 w-full rounded-full bg-transparent" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="button" className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={nextWeek}>
            Next
          </button>
        </div>
      </div>

      {/* DESKTOP: month grid */}
      <div className="hidden md:block rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">{monthLabel}</div>
            <div className="text-sm text-gray-600">Month grid (desktop). Activity shown as a tiny heat bar.</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={prevMonth}>
              Prev
            </button>
            <button type="button" className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={gotoToday}>
              Today
            </button>
            <button type="button" className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={nextMonth}>
              Next
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-gray-600">
          {dow.map((x) => (
            <div key={x} className="px-1 py-1 font-medium">
              {x}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {grid.map((x) => {
            const isSel = x.iso === selectedISO;
            const heat = clampHeat(x.info?.entries ?? 0);

            return (
              <button
                key={x.iso}
                type="button"
                onClick={() => selectDay(x.iso)}
                className={[
                  "rounded-2xl border p-2 text-left hover:bg-gray-50",
                  x.inMonth ? "bg-white" : "bg-gray-50 text-gray-400",
                  isSel ? "border-violet-400 ring-2 ring-violet-200" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{x.d.getUTCDate()}</div>
                </div>

                {/* Heat bar (no number badge) */}
                {heat.show ? (
                  <div className="mt-2 h-1 w-full rounded-full bg-gray-100">
                    <div className={`h-1 rounded-full bg-violet-600 ${heat.cls}`} />
                  </div>
                ) : (
                  <div className="mt-2 h-1 w-full rounded-full bg-transparent" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day panel (count shown here only) */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{selectedLabel}</div>
            <div className="text-sm text-gray-600">
              {selectedInfo
                ? selectedInfo.entries > 0
                  ? `${selectedInfo.entries} roster entr${selectedInfo.entries === 1 ? "y" : "ies"} (bhajans).`
                  : "Session exists, but no roster rows yet."
                : "No session found for this day."}
            </div>
          </div>

          {selectedInfo?.sessionId ? (
            <Link className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" href={`/roster/${selectedInfo.sessionId}`}>
              Open session
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
