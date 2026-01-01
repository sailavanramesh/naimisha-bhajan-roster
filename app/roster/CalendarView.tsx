"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CalSession = {
  id: string;
  dateISO: string;
  preview: string;
  count: number; // <-- number of roster rows (bhajans) in that session
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function yyyymm(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonthFromYYYYMM(m: string) {
  const ok = /^\d{4}-\d{2}$/.test(m);
  if (!ok) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [yy, mm] = m.split("-").map(Number);
  return new Date(yy, (mm || 1) - 1, 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function CalendarView(props: { initialMonth: string; sessions: CalSession[] }) {
  const router = useRouter();
  const [monthStart, setMonthStart] = useState<Date>(() => startOfMonthFromYYYYMM(props.initialMonth));

  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const [selectedKey, setSelectedKey] = useState<string>(() => localDateKey(new Date()));

  // Sessions grouped by day (browser-local day key)
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, CalSession[]>();
    for (const s of props.sessions) {
      const key = localDateKey(new Date(s.dateISO));
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [props.sessions]);

  // Day meta: total roster rows for that day
  const dayMeta = useMemo(() => {
    const meta = new Map<string, { hasSession: boolean; totalRows: number; firstPreview: string }>();
    for (const [key, sessions] of sessionsByDay.entries()) {
      const totalRows = sessions.reduce((sum, s) => sum + (s.count || 0), 0);
      const firstPreview = sessions.find((x) => (x.preview || "").trim())?.preview ?? "";
      meta.set(key, { hasSession: true, totalRows, firstPreview });
    }
    return meta;
  }, [sessionsByDay]);

  // Build a 6-week grid starting Monday
  const cells = useMemo(() => {
    const first = new Date(monthStart);
    const day = first.getDay(); // 0=Sun..6=Sat
    const mondayIndex = (day + 6) % 7; // 0=Mon..6=Sun
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayIndex);

    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push(d);
    }
    return out;
  }, [monthStart]);

  const selectedSessions = sessionsByDay.get(selectedKey) ?? [];
  const selectedTotalRows = selectedSessions.reduce((sum, s) => sum + (s.count || 0), 0);

  function goToMonth(d: Date) {
    setMonthStart(d);
    const m = yyyymm(d);
    router.replace(`/roster?view=calendar&m=${encodeURIComponent(m)}`);
  }

  function goToday() {
    const now = new Date();
    setSelectedKey(localDateKey(now));
    goToMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="rounded-2xl border bg-white p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">{monthLabel(monthStart)}</div>
          <div className="mt-1 text-sm text-gray-600">
            Badge shows number of roster entries (bhajans), not sessions.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => goToMonth(addMonths(monthStart, -1))}
            className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => goToMonth(addMonths(monthStart, 1))}
            className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-gray-500">
        {weekdays.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="mt-2 grid grid-cols-7 gap-2">
        {cells.map((d) => {
          const inMonth = d.getMonth() === monthStart.getMonth();
          const key = localDateKey(d);
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;

          const meta = dayMeta.get(key);
          const hasSession = !!meta?.hasSession;
          const totalRows = meta?.totalRows ?? 0;

          // Show badge ONLY if there are roster rows for that day
          const showBadge = totalRows > 0;

          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelectedKey(key)}
              className={[
                "relative rounded-2xl border p-2 text-left transition",
                inMonth ? "bg-white" : "bg-gray-50 text-gray-400",
                isSelected ? "border-black/30 ring-2 ring-black/10" : "hover:bg-gray-50",
              ].join(" ")}
              title={
                showBadge
                  ? `${totalRows} roster entries`
                  : hasSession
                    ? "Session exists but no roster entries yet"
                    : "No session"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className={["text-sm font-semibold", isToday ? "text-black" : ""].join(" ")}>
                  {d.getDate()}
                </div>

                {showBadge ? (
                  <div className="rounded-full bg-black px-2 py-0.5 text-[11px] font-semibold text-white">
                    {totalRows}
                  </div>
                ) : null}
              </div>

              {/* Marker line:
                  - if there are rows: darker
                  - if session exists but 0 rows: lighter marker (no badge)
                  - else: nothing
              */}
              {totalRows > 0 ? (
                <div className="mt-2 h-1.5 w-10 rounded-full bg-black/20" />
              ) : hasSession ? (
                <div className="mt-2 h-1.5 w-10 rounded-full bg-black/10" />
              ) : (
                <div className="mt-2 h-1.5 w-10 rounded-full bg-transparent" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day panel */}
      <div className="mt-5 rounded-2xl border bg-gray-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {new Date(selectedKey).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {selectedSessions.length === 0
                ? "No session found for this day."
                : selectedTotalRows > 0
                  ? `${selectedTotalRows} roster entr${selectedTotalRows === 1 ? "y" : "ies"} for this day.`
                  : "Session exists, but no roster entries yet."}
            </div>
          </div>

          <Link
            href="/roster?view=list"
            className="self-start rounded-xl border bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Switch to list
          </Link>
        </div>

        <div className="mt-3 grid gap-2">
          {selectedSessions.length === 0 ? (
            <div className="rounded-xl border bg-white p-3 text-sm text-gray-700">Nothing recorded yet.</div>
          ) : (
            selectedSessions.map((s) => (
              <Link
                key={s.id}
                href={`/roster/${s.id}`}
                className="rounded-xl border bg-white p-3 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold">Open session</div>
                  <div className="text-xs text-gray-600">{s.count} rows</div>
                </div>
                <div className="mt-1 text-sm text-gray-700">{s.preview || "—"}</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
