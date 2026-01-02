"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { fetchMonthInfo, createSessionForDate } from "./calendarActions";

type DayInfo = {
  hasSession: boolean;
  entries: number;
  sessionId?: string;
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fromISODate(s: string) {
  const [y, m, day] = s.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, day));
}

function addDaysUTC(d: Date, days: number) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function monthStartUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfWeekSundayUTC(d: Date) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  out.setUTCDate(out.getUTCDate() - out.getUTCDay());
  return out;
}

export default function RosterCalendarClient(props: {
  canEdit: boolean;
  initialMonth: string;
  initialSelected: string;
  initialDayInfo: Record<string, DayInfo>;
}) {
  const { canEdit, initialMonth, initialSelected, initialDayInfo } = props;
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState<string>(initialMonth);
  const [selected, setSelected] = useState<string>(initialSelected);
  const [dayInfo, setDayInfo] = useState<Record<string, DayInfo>>(initialDayInfo);
  const [isPending, startTransition] = useTransition();

  const monthDate = useMemo(() => {
    const [y, m] = currentMonth.split("-").map((x) => Number(x));
    return new Date(Date.UTC(y, m - 1, 1));
  }, [currentMonth]);

  async function ensureMonthLoaded(nextMonthKey: string) {
    if (dayInfo && Object.keys(dayInfo).length && currentMonth === nextMonthKey) return;

    startTransition(async () => {
      const data = await fetchMonthInfo(nextMonthKey);
      setDayInfo((prev) => ({ ...prev, ...data.dayInfo }));
    });
  }

  useEffect(() => {
    ensureMonthLoaded(currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  const gridStart = startOfWeekSundayUTC(monthDate);
  const grid = Array.from({ length: 42 }, (_, i) => addDaysUTC(gridStart, i));

  async function onDayClick(dateISO: string) {
    setSelected(dateISO);

    const info = dayInfo[dateISO];
    const existing = info?.sessionId;
    if (existing) {
      router.push(`/roster/${existing}`);
      return;
    }

    if (!canEdit) return;

    // Create and navigate
    startTransition(async () => {
      const created = await createSessionForDate(dateISO);
      setDayInfo((prev) => ({
        ...prev,
        [dateISO]: { hasSession: true, entries: 0, sessionId: created.id },
      }));
      router.push(`/roster/${created.id}`);
    });
  }

  function navMonth(delta: number) {
    const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + delta, 1));
    setCurrentMonth(monthKey(next));
  }

  const selectedInfo = dayInfo[selected];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => navMonth(-1)} disabled={isPending}>
            Prev
          </Button>
          <Button type="button" onClick={() => navMonth(1)} disabled={isPending}>
            Next
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-slate-600">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {grid.map((d) => {
          const date = toISODate(d);
          const inMonth = d.getUTCMonth() === monthDate.getUTCMonth();
          const isSelected = date === selected;

          const info = dayInfo[date];
          // Be permissive: if we have a sessionId, treat it as an existing session.
          const hasSession = !!info?.sessionId || !!info?.hasSession;
          const entries = info?.entries ?? 0;

          return (
            <button
              key={date}
              type="button"
              onClick={() => onDayClick(date)}
              className={[
                "relative rounded-2xl border px-2 py-2 text-left hover:bg-slate-50",
                isSelected ? "border-slate-900" : "border-slate-200",
                inMonth ? "bg-white" : "bg-slate-50 text-slate-400",
              ].join(" ")}
            >
              <div className="text-xs">{d.getUTCDate()}</div>

              {/* indicator */}
              {hasSession ? (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                  {entries > 0 ? (
                    <div
                      className={[
                        "h-1.5 w-6 rounded-full",
                        entries >= 8 ? "bg-indigo-600/50" : entries >= 4 ? "bg-indigo-600/35" : "bg-indigo-600/20",
                      ].join(" ")}
                    />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full border border-black/15 bg-white/80" />
                  )}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border bg-white p-3 text-sm">
        <div className="font-semibold">
          Selected: {fromISODate(selected).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>

        {selectedInfo?.sessionId ? (
          <div className="mt-1 text-slate-700">
            Session exists{typeof selectedInfo.entries === "number" ? ` (${selectedInfo.entries} row${selectedInfo.entries === 1 ? "" : "s"})` : ""}.
          </div>
        ) : canEdit ? (
          <div className="mt-1 text-slate-700">No session yet. Click the day to create one and jump in.</div>
        ) : (
          <div className="mt-1 text-slate-700">No session for this day.</div>
        )}
      </div>

      {isPending ? <div className="text-xs text-slate-500">Loading…</div> : null}
    </div>
  );
}
