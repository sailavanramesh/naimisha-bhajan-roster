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

  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  }, []);

  // Desktop month grid days
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

  const daysToRender = isMobile ? weekStrip : monthGrid;

  async function openOrCreate(iso: string) {
    const info = props.dayInfo[iso];

    // If session exists: always open it (both view + edit)
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
      if (data?.id) {
        router.push(`/roster/${data.id}`);
      }
    });
  }

  function onPickDay(d: Date) {
    const iso = toISODateUTC(d);
    setSelected(d);
    openOrCreate(iso);
  }

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

      {/* Days */}
      <div
        className={
          isMobile
            ? "grid grid-cols-7 gap-2"
            : "grid grid-cols-7 gap-2"
        }
      >
        {daysToRender.map((d) => {
          const iso = toISODateUTC(d);
          const info = props.dayInfo[iso];
          const entries = info?.entries ?? 0;
          const hasRows = entries > 0;

          const selectedIso = toISODateUTC(selected);
          const isSelected = iso === selectedIso;

          const inMonth = isSameMonthUTC(d, month);

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPickDay(d)}
              className={[
                "relative rounded-2xl border px-2 py-2 text-left transition",
                "hover:bg-gray-50",
                isSelected ? "ring-2 ring-black/10 bg-white" : "bg-white",
                !inMonth && !isMobile ? "opacity-50" : "",
              ].join(" ")}
              aria-label={iso}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-600">
                  {isMobile
                    ? d.toLocaleDateString(undefined, { weekday: "short" })
                    : ""}
                </div>
                {/* Tiny dot instead of counts */}
                <div
                  className={[
                    "h-2 w-2 rounded-full",
                    hasRows ? "bg-black/60" : "bg-transparent",
                  ].join(" ")}
                />
              </div>

              <div className="mt-1 text-sm font-semibold">
                {d.getUTCDate()}
              </div>

              {/* On selection: show count (but not as a badge on every day) */}
              {isSelected && hasRows ? (
                <div className="mt-1 text-[11px] text-gray-600">
                  {entries} item{entries === 1 ? "" : "s"}
                </div>
              ) : null}

              {isSelected && !hasRows && props.canEdit ? (
                <div className="mt-1 text-[11px] text-gray-600">
                  Tap creates session
                </div>
              ) : null}

              {isSelected && !hasRows && !props.canEdit ? (
                <div className="mt-1 text-[11px] text-gray-600">
                  No session
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {isPending ? (
        <div className="text-xs text-gray-600">Opening…</div>
      ) : null}
    </div>
  );
}
