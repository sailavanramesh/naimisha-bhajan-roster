"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

type DayInfo = Record<string, { sessionId: string; entries: number }>;

function isoDateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseMonthKeyUTC(m: string) {
  const mm = /^(\d{4})-(\d{2})$/.exec(m);
  if (!mm) return new Date(Date.UTC(1970, 0, 1));
  return new Date(Date.UTC(Number(mm[1]), Number(mm[2]) - 1, 1));
}

function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function addMonthsUTC(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function startOfCalendarGridUTC(monthStart: Date) {
  // Monday-first grid
  const day = (monthStart.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  const out = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  out.setUTCDate(out.getUTCDate() - day);
  return out;
}

async function fetchMonthInfo(m: string): Promise<DayInfo> {
  const res = await fetch(`/api/roster/month?m=${encodeURIComponent(m)}`, { cache: "no-store" });
  if (!res.ok) return {};
  const data = await res.json();
  return (data.dayInfo || {}) as DayInfo;
}

async function ensureSession(dateISO: string): Promise<string | null> {
  const res = await fetch("/api/roster/ensure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date: dateISO }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.sessionId as string) || null;
}

export function RosterCalendarClient(props: {
  canEdit: boolean;
  initialMonth: string; // YYYY-MM
  initialSelected: string; // YYYY-MM-DD
  initialDayInfo: DayInfo;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [month, setMonth] = useState(props.initialMonth);
  const [selected, setSelected] = useState(props.initialSelected);
  const [dayInfo, setDayInfo] = useState<DayInfo>(props.initialDayInfo);

  const monthStart = useMemo(() => parseMonthKeyUTC(month), [month]);
  const gridStart = useMemo(() => startOfCalendarGridUTC(monthStart), [monthStart]);

  // Keep calendar markers fresh when month changes
  useEffect(() => {
    let alive = true;
    (async () => {
      const info = await fetchMonthInfo(month);
      if (alive) setDayInfo(info);
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  const weeks = useMemo(() => {
    const out: Date[][] = [];
    let cur = new Date(gridStart);
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let i = 0; i < 7; i++) {
        row.push(new Date(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      out.push(row);
    }
    return out;
  }, [gridStart]);

  function labelMonth(d: Date) {
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  }

  function entriesToHeat(entries: number) {
    // tiny heat bar width (0..100). You can tweak later.
    if (entries <= 0) return 0;
    if (entries === 1) return 35;
    if (entries === 2) return 55;
    if (entries === 3) return 70;
    return 90;
  }

  function onTapDay(iso: string) {
    setSelected(iso);

    const info = dayInfo[iso];

    startTransition(async () => {
      // If session exists, ALWAYS open it (read-only + edit)
      if (info?.sessionId) {
        router.push(`/roster/${info.sessionId}`);
        return;
      }

      // If no session exists:
      if (!props.canEdit) {
        // read-only: do nothing (but selection still updates)
        return;
      }

      // edit: create session + open
      const sessionId = await ensureSession(iso);
      if (!sessionId) return;

      // optimistic marker: show dot immediately
      setDayInfo((prev) => ({
        ...prev,
        [iso]: { sessionId, entries: 0 },
      }));

      router.push(`/roster/${sessionId}`);
    });
  }

  return (
    <div className="grid gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setMonth(monthKeyUTC(addMonthsUTC(monthStart, -1)))}
          disabled={isPending}
        >
          Prev
        </button>

        <div className="text-sm font-semibold">{labelMonth(monthStart)}</div>

        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setMonth(monthKeyUTC(addMonthsUTC(monthStart, 1)))}
          disabled={isPending}
        >
          Next
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center text-[11px] sm:text-xs text-gray-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Month grid (mobile + desktop) */}
      <div className="grid gap-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-2">
            {week.map((d) => {
              const iso = isoDateUTC(d);
              const inMonth = d.getUTCMonth() === monthStart.getUTCMonth();
              const isSelected = iso === selected;

              const info = dayInfo[iso];
              const hasSession = !!info?.sessionId;
              const entries = info?.entries ?? 0;

              const heat = entriesToHeat(entries);

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => onTapDay(iso)}
                  className={clsx(
                    "relative rounded-2xl border bg-white text-left",
                    // more breathing room on mobile
                    "min-h-[48px] sm:min-h-[64px] p-2 sm:p-3",
                    "hover:bg-gray-50 active:scale-[0.99] transition",
                    !inMonth && "opacity-40",
                    isSelected && "ring-2 ring-black"
                  )}
                >
                  {/* Day number */}
                  <div className="text-[12px] sm:text-sm font-medium">{d.getUTCDate()}</div>

                  {/* Indicators */}
                  {hasSession ? (
                    <>
                      {/* Dot: session exists */}
                      <div
                        className={clsx(
                          "absolute top-2 right-2 h-2 w-2 rounded-full",
                          entries > 0 ? "bg-black" : "bg-gray-400"
                        )}
                        title={entries > 0 ? `${entries} entries` : "Session exists"}
                      />
                      {/* Heat bar: only if entries>0 */}
                      {entries > 0 ? (
                        <div className="absolute left-2 right-2 bottom-2">
                          <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                            <div className="h-full bg-black rounded-full" style={{ width: `${heat}%` }} />
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-600">
        {props.canEdit ? (
          <>Tap a day to open it. If no session exists, it will be created.</>
        ) : (
          <>Tap a day with a dot to open that session (read-only).</>
        )}
      </div>
    </div>
  );
}
