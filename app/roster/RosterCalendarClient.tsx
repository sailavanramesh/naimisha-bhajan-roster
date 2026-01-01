"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type DayInfo = Record<string, { sessionId: string; entries: number }>;

function isoParts(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) };
}

function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function toMonthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fromMonthKeyUTC(m: string) {
  const x = /^(\d{4})-(\d{2})$/.exec(m);
  if (!x) return null;
  const y = Number(x[1]);
  const mo = Number(x[2]) - 1;
  const dt = new Date(Date.UTC(y, mo, 1));
  return isNaN(dt.getTime()) ? null : dt;
}

function startOfWeekMondayUTC(d: Date) {
  // Monday=0 ... Sunday=6
  const day = (d.getUTCDay() + 6) % 7;
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - day);
  return out;
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function getMonthGrid(monthStartUTC: Date) {
  const first = new Date(Date.UTC(monthStartUTC.getUTCFullYear(), monthStartUTC.getUTCMonth(), 1));
  const firstDay = (first.getUTCDay() + 6) % 7; // Monday=0
  const gridStart = addDaysUTC(first, -firstDay);

  const weeks: Date[][] = [];
  let cur = gridStart;
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) row.push(addDaysUTC(cur, w * 7 + i));
    weeks.push(row);
  }
  return weeks;
}

export function RosterCalendarClient(props: {
  initialMonth: string; // YYYY-MM
  initialSelected: string; // YYYY-MM-DD
  dayInfo: DayInfo;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [monthKey, setMonthKey] = useState(props.initialMonth);
  const [selectedISO, setSelectedISO] = useState(props.initialSelected);

  const monthStart = useMemo(() => {
    return fromMonthKeyUTC(monthKey) ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  }, [monthKey]);

  const selectedDate = useMemo(() => {
    const p = isoParts(selectedISO);
    if (!p) return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    return new Date(Date.UTC(p.y, p.mo, p.d));
  }, [selectedISO]);

  function pushRosterParams(nextMonthKey: string, nextSelectedISO: string) {
    const next = new URLSearchParams(sp?.toString() || "");
    next.set("view", "calendar");
    next.set("m", nextMonthKey);
    next.set("d", nextSelectedISO);
    router.push(`/roster?${next.toString()}`);
  }

  function goMonth(delta: number) {
    const dt = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + delta, 1));
    const mk = toMonthKeyUTC(dt);
    setMonthKey(mk);
    // keep selected inside the new month if possible
    const keep = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), Math.min(selectedDate.getUTCDate(), 28)));
    const iso = toISODateUTC(keep);
    setSelectedISO(iso);
    pushRosterParams(mk, iso);
  }

  function onSelectDay(iso: string) {
    setSelectedISO(iso);

    const info = props.dayInfo[iso];
    if (info?.sessionId) {
      // ✅ direct jump into that day's session (no extra click)
      router.push(`/roster/${info.sessionId}`);
      return;
    }

    // fallback: just update query params
    pushRosterParams(monthKey, iso);
  }

  // MOBILE: week strip
  const weekStart = useMemo(() => startOfWeekMondayUTC(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysUTC(weekStart, i)), [weekStart]);

  function goWeek(deltaWeeks: number) {
    const next = addDaysUTC(selectedDate, deltaWeeks * 7);
    const iso = toISODateUTC(next);
    const mk = toMonthKeyUTC(next);
    setSelectedISO(iso);
    setMonthKey(mk);
    pushRosterParams(mk, iso);
  }

  // DESKTOP: month grid
  const weeks = useMemo(() => getMonthGrid(monthStart), [monthStart]);

  const monthLabel = useMemo(() => {
    return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1)).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  }, [monthStart]);

  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="grid gap-3">
      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Prev
        </button>

        <div className="text-sm font-semibold">{monthLabel}</div>

        <button
          type="button"
          onClick={() => goMonth(1)}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Next
        </button>
      </div>

      {/* Mobile week strip */}
      <div className="md:hidden rounded-2xl border bg-white p-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => goWeek(-1)}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Prev
          </button>

          <div className="text-sm font-semibold">
            {selectedDate.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
          </div>

          <button
            type="button"
            onClick={() => goWeek(1)}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Next
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {weekDays.map((d) => {
            const iso = toISODateUTC(d);
            const isSelected = iso === selectedISO;
            const info = props.dayInfo[iso];
            const hasAnySession = Boolean(info?.sessionId);
            const hasEntries = (info?.entries ?? 0) > 0;

            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDay(iso)}
                className={[
                  "relative rounded-xl border px-1 py-2 text-center",
                  isSelected ? "bg-black text-white" : "bg-white hover:bg-gray-50",
                ].join(" ")}
              >
                <div className="text-[10px] opacity-80">{dow[(d.getUTCDay() + 6) % 7]}</div>
                <div className="text-sm font-semibold leading-5">{d.getUTCDate()}</div>

                {/* Dot only (less clutter). Only show dot if entries>0. */}
                {hasEntries ? (
                  <span
                    className={[
                      "absolute left-1/2 -translate-x-1/2 bottom-1 h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-white" : "bg-black",
                    ].join(" ")}
                    aria-label="Has roster entries"
                  />
                ) : hasAnySession ? (
                  // Optional: faint dot to indicate session exists but empty (keeps feel consistent)
                  <span
                    className={[
                      "absolute left-1/2 -translate-x-1/2 bottom-1 h-1 w-1 rounded-full opacity-30",
                      isSelected ? "bg-white" : "bg-black",
                    ].join(" ")}
                    aria-label="Has session"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop month grid */}
      <div className="hidden md:block rounded-2xl border bg-white p-3">
        <div className="grid grid-cols-7 gap-2 text-xs text-gray-500">
          {dow.map((x) => (
            <div key={x} className="px-2">
              {x}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-rows-6 gap-2">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-2">
              {week.map((d) => {
                const iso = toISODateUTC(d);
                const isInMonth = d.getUTCMonth() === monthStart.getUTCMonth();
                const isSelected = iso === selectedISO;

                const info = props.dayInfo[iso];
                const hasAnySession = Boolean(info?.sessionId);
                const hasEntries = (info?.entries ?? 0) > 0;

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => onSelectDay(iso)}
                    className={[
                      "relative h-14 rounded-xl border px-2 py-2 text-left hover:bg-gray-50",
                      isSelected ? "bg-black text-white" : "bg-white",
                      isInMonth ? "" : "opacity-40",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold">{d.getUTCDate()}</div>

                    {/* Dot only */}
                    {hasEntries ? (
                      <span
                        className={[
                          "absolute right-2 top-2 h-2 w-2 rounded-full",
                          isSelected ? "bg-white" : "bg-black",
                        ].join(" ")}
                        aria-label="Has roster entries"
                      />
                    ) : hasAnySession ? (
                      <span
                        className={[
                          "absolute right-2 top-2 h-2 w-2 rounded-full opacity-25",
                          isSelected ? "bg-white" : "bg-black",
                        ].join(" ")}
                        aria-label="Has session"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Optional selected info (desktop + mobile) */}
      <div className="text-sm text-gray-700">
        Selected:{" "}
        <span className="font-medium">
          {selectedDate.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
        </span>
      </div>
    </div>
  );
}
