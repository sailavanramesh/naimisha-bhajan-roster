"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DayInfo = { sessionId: string; entries: number; hasSession: boolean };

function monthStartUTC(yyyyMm: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 0, 0, 0));
}

function isoUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function startOfGridUTC(monthStart: Date) {
  // Monday-start calendar
  const dow = (monthStart.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  return addDaysUTC(monthStart, -dow);
}

export function RosterCalendarClient(props: {
  canEdit: boolean;
  initialMonth: string; // YYYY-MM
  initialSelected: string; // YYYY-MM-DD
  initialDayInfo: Record<string, DayInfo>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [month, setMonth] = useState(props.initialMonth);
  const [selected, setSelected] = useState(props.initialSelected);
  const [dayInfo, setDayInfo] = useState<Record<string, DayInfo>>(props.initialDayInfo);
  const [hint, setHint] = useState<string>("");

  const ms = useMemo(() => monthStartUTC(month), [month]);
  const gridStart = useMemo(() => startOfGridUTC(ms), [ms]);

  const weeks = useMemo(() => {
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) cells.push(addDaysUTC(gridStart, i));
    const rows: Date[][] = [];
    for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
    return rows;
  }, [gridStart]);

  async function loadMonth(m: string) {
    const res = await fetch(`/api/roster/month?month=${encodeURIComponent(m)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setDayInfo((data?.days || {}) as Record<string, DayInfo>);
  }

  useEffect(() => {
    // keep calendar indicators fresh
    loadMonth(month).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function lookupSessionId(date: string) {
    const res = await fetch(`/api/roster/lookup?date=${encodeURIComponent(date)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.sessionId as string | null) ?? null;
  }

  async function ensureSessionId(date: string) {
    const res = await fetch(`/api/roster/ensure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.sessionId as string | null) ?? null;
  }

  function goPrev() {
    const d = new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth() - 1, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    setMonth(`${y}-${m}`);
  }

  function goNext() {
    const d = new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth() + 1, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    setMonth(`${y}-${m}`);
  }

  async function onTapDay(date: string) {
    setHint("");
    setSelected(date);

    // Try from cached month info first
    const info = dayInfo[date];
    if (info?.sessionId) {
      router.push(`/roster/${info.sessionId}`);
      return;
    }

    // If cache missed (timezone / range / etc), look it up server-side (read-only safe)
    const found = await lookupSessionId(date);
    if (found) {
      router.push(`/roster/${found}`);
      return;
    }

    // No session exists
    if (!props.canEdit) {
      setHint("No session on this day.");
      return;
    }

    // Edit mode: create + open
    startTransition(async () => {
      const sid = await ensureSessionId(date);
      if (sid) router.push(`/roster/${sid}`);
    });
  }

  const title = useMemo(() => {
    const d = ms;
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  }, [ms]);

  const selectedInfo = dayInfo[selected];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={goPrev}
        >
          Prev
        </button>

        <div className="text-sm font-semibold">{title}</div>

        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          onClick={goNext}
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-xs text-gray-600">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
          <div key={x} className="px-1 py-1 text-center">
            {x}
          </div>
        ))}
      </div>

      <div className="grid gap-1 sm:gap-2">
        {weeks.map((row, idx) => (
          <div key={idx} className="grid grid-cols-7 gap-1 sm:gap-2">
            {row.map((d) => {
              const date = isoUTC(d);
              const inMonth = d.getUTCMonth() === ms.getUTCMonth();
              const isSelected = date === selected;

              const info = dayInfo[date];
              const hasSession = info?.hasSession;
              const entries = info?.entries ?? 0;

              // A tiny "heat bar" intensity based on entries (cap at 6)
              const intensity = Math.min(entries, 6) / 6;

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onTapDay(date)}
                  className={[
                    "relative rounded-xl border text-left",
                    "min-h-[54px] sm:min-h-[68px]",
                    "px-2 py-2",
                    "transition hover:bg-gray-50",
                    inMonth ? "bg-white" : "bg-gray-50 text-gray-400",
                    isSelected ? "ring-2 ring-black/15" : "",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{d.getUTCDate()}</div>

                  {/* Indicator */}
                  {hasSession ? (
                    entries > 0 ? (
                      <div
                        className="absolute bottom-2 left-2 right-2 h-1 rounded-full bg-black/20"
                        style={{ opacity: 0.25 + intensity * 0.6 }}
                        aria-hidden
                      />
                    ) : (
                      <div className="absolute bottom-2 left-2 h-2 w-2 rounded-full bg-black/10" aria-hidden />
                    )
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">
              {new Date(`${selected}T00:00:00.000Z`).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </div>
            <div className="text-gray-600">
              {selectedInfo?.hasSession
                ? selectedInfo.entries > 0
                  ? `${selectedInfo.entries} bhajan row${selectedInfo.entries === 1 ? "" : "s"}`
                  : "Session exists (no bhajans yet)"
                : props.canEdit
                ? "Tap to create a session."
                : "No session."}
            </div>
          </div>

          {isPending ? <div className="text-gray-600">Opening…</div> : null}
        </div>

        {hint ? <div className="mt-2 text-xs text-gray-600">{hint}</div> : null}
      </div>
    </div>
  );
}
