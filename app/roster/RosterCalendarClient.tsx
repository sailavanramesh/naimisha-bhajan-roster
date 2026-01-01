"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DayInfo = Record<string, { sessionId: string; entries: number }>;

function isoToUTCDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
}

function monthKeyToUTCDate(mk: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(mk);
  if (!m) return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addMonthsUTC(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function startOfWeekMondayUTC(d: Date) {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - day);
  return out;
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function isSameMonthUTC(a: Date, monthStart: Date) {
  return a.getUTCFullYear() === monthStart.getUTCFullYear() && a.getUTCMonth() === monthStart.getUTCMonth();
}

function heatClass(entries: number) {
  // tiny “heat bar” intensity, no numbers unless selected
  if (entries >= 10) return "bg-black/70";
  if (entries >= 6) return "bg-black/55";
  if (entries >= 3) return "bg-black/40";
  if (entries >= 1) return "bg-black/25";
  return "bg-black/10";
}

export function RosterCalendarClient(props: {
  canEdit: boolean;
  initialMonth: string; // YYYY-MM
  initialSelected: string; // YYYY-MM-DD
  dayInfo: DayInfo;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [month, setMonth] = useState(() => monthKeyToUTCDate(props.initialMonth));
  const [selected, setSelected] = useState(() => isoToUTCDate(props.initialSelected));

  // Desktop month grid days (6 weeks)
  const monthGrid = useMemo(() => {
    const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const start = startOfWeekMondayUTC(first);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) out.push(addDaysUTC(start, i));
    return out;
  }, [month]);

  // Mobile week strip
  const weekStrip = useMemo(() => {
    const start = startOfWeekMondayUTC(selected);
    return Array.from({ length: 7 }, (_, i) => addDaysUTC(start, i));
  }, [selected]);

  async function openOrCreate(iso: string) {
    const info = props.dayInfo[iso];

    // If session exists: always open it
    if (info?.sessionId) {
      router.push(`/roster/${info.sessionId}`);
      return;
    }

    // If no session exists:
    // - read-only: do nothing
    // - edit: create then open
    if (!props.canEdit) return;

    startTransition(async () => {
      const res = await fetch("/api/sessions/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: iso }),
      });

      if (!res.ok) return;

      const data = (await res.json()) as { id: string };
      if (data?.id) router.push(`/roster/${data.id}`);
    });
  }

  function onPickDay(d: Date) {
    const iso = toISODateUTC(d);
    setSelected(d);
    openOrCreate(iso);
  }

  const selectedIso = toISODateUTC(selected);

  const WeekdayHeader = ({ compact }: { compact?: boolean }) => {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return (
      <div className={compact ? "grid grid-cols-7 gap-2" : "grid grid-cols-7 gap-2"}>
        {labels.map((w) => (
          <div key={w} className="px-2 text-[11px] font-medium text-gray-500">
            {w}
          </div>
        ))}
      </div>
    );
  };

  const DayCell = ({
    d,
    showOutOfMonthFade,
  }: {
    d: Date;
    showOutOfMonthFade: boolean;
  }) => {
    const iso = toISODateUTC(d);
    const info = props.dayInfo[iso];
    const hasSession = !!info?.sessionId;
    const entries = info?.entries ?? 0;

    const isSelected = iso === selectedIso;
    const inMonth = isSameMonthUTC(d, month);

    // Marker rules:
    // - hasSession: show a small dot (even if entries=0)
    // - entries>0: show a tiny heat bar too (intensity by entries)
    // - counts only shown on selected day
    const showDot = hasSession;
    const showHeat = hasSession; // show faint heat even if 0, stronger with entries

    return (
      <button
        key={iso}
        type="button"
        onClick={() => onPickDay(d)}
        className={[
          "relative rounded-2xl border bg-white px-2 py-2 text-left transition",
          "hover:bg-gray-50 active:scale-[0.99]",
          isSelected ? "ring-2 ring-black/15" : "",
          showOutOfMonthFade && !inMonth ? "opacity-45" : "",
        ].join(" ")}
        aria-label={iso}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold leading-none">{d.getUTCDate()}</div>
          <div
            className={[
              "mt-[2px] h-2 w-2 rounded-full",
              showDot ? (entries > 0 ? "bg-black/60" : "bg-black/25") : "bg-transparent",
            ].join(" ")}
            aria-hidden="true"
          />
        </div>

        {/* Tiny heat bar along the bottom (subtle, not a badge) */}
        {showHeat ? (
          <div className="mt-2">
            <div className="h-1 w-full rounded-full bg-black/5 overflow-hidden">
              <div
                className={[
                  "h-full rounded-full",
                  heatClass(entries),
                ].join(" ")}
                style={{
                  width:
                    entries <= 0
                      ? "20%"
                      : entries >= 12
                      ? "100%"
                      : `${Math.min(100, 20 + entries * 7)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-2 h-1" />
        )}

        {/* Selected-day text (count shown only when selected) */}
        {isSelected ? (
          <div className="mt-2 text-[11px] text-gray-600">
            {hasSession ? (
              entries > 0 ? (
                <>
                  {entries} item{entries === 1 ? "" : "s"}
                </>
              ) : props.canEdit ? (
                <>Session (empty)</>
              ) : (
                <>Session</>
              )
            ) : props.canEdit ? (
              <>Tap creates session</>
            ) : (
              <>No session</>
            )}
          </div>
        ) : null}
      </button>
    );
  };

  return (
    <div className="grid gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setMonth((m) => addMonthsUTC(m, -1))}
        >
          Prev
        </button>

        <div className="text-sm font-semibold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>

        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setMonth((m) => addMonthsUTC(m, 1))}
        >
          Next
        </button>
      </div>

      {/* Mobile: week strip */}
      <div className="sm:hidden grid gap-2">
        <WeekdayHeader compact />
        <div className="grid grid-cols-7 gap-2">
          {weekStrip.map((d) => (
            <DayCell key={toISODateUTC(d)} d={d} showOutOfMonthFade={false} />
          ))}
        </div>
      </div>

      {/* Desktop: month grid */}
      <div className="hidden sm:grid gap-2">
        <WeekdayHeader />
        <div className="grid grid-cols-7 gap-2">
          {monthGrid.map((d) => (
            <DayCell key={toISODateUTC(d)} d={d} showOutOfMonthFade />
          ))}
        </div>
      </div>

      {isPending ? <div className="text-xs text-gray-600">Opening…</div> : null}
    </div>
  );
}
