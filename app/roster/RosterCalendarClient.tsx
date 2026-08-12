"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SessionRows } from "@/components/SessionRows";
import { Button, Input } from "@/components/ui";
import { fetchMonthInfo, createSessionForDate } from "./calendarActions";
import { sortByStart, sessionLabel, hasSeveral, USUAL_START } from "@/lib/sessionsOfDay";

type DaySession = {
  id: string;
  startsAt: string | null;
  categoryName: string | null;
  entries: number;
  rows?: { singer: string; bhajan: string | null; pitch: string | null }[];
};

/**
 * A day is a LIST of sessions.
 *
 * It used to be one, because Session.date was unique. Sailavan, 2026-08-12:
 * "some days there are 3 sessions" — so the cell says how many and the panel
 * below lays each of them out separately, with its own time, kind and rows.
 * Nothing is hidden behind a default here: a day that holds three sessions
 * should not read as a day that holds one busy one.
 */
type DayInfo = { sessions: DaySession[] };

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
  const [denied, setDenied] = useState<string | null>(null);
  const [jumpDate, setJumpDate] = useState<string>(initialSelected);
  const [isPending, startTransition] = useTransition();
  const loadedMonthsRef = useRef<Set<string>>(new Set([initialMonth]));

  const monthDate = useMemo(() => {
    const [y, m] = currentMonth.split("-").map((x) => Number(x));
    return new Date(Date.UTC(y, m - 1, 1));
  }, [currentMonth]);

  async function ensureMonthLoaded(nextMonthKey: string) {
    if (loadedMonthsRef.current.has(nextMonthKey)) return;
    loadedMonthsRef.current.add(nextMonthKey);

    startTransition(async () => {
      const data = await fetchMonthInfo(nextMonthKey);
      setDayInfo((prev) => ({ ...prev, ...data.dayInfo }));
    });
  }

  useEffect(() => {
    ensureMonthLoaded(currentMonth);

    const prev = monthKey(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() - 1, 1)));
    const next = monthKey(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1)));
    ensureMonthLoaded(prev);
    ensureMonthLoaded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  const gridStart = startOfWeekSundayUTC(monthDate);
  const grid = Array.from({ length: 42 }, (_, i) => addDaysUTC(gridStart, i));

  async function onDayClick(dateISO: string) {
    setSelected(dateISO);
    setJumpDate(dateISO);

    const existing = sortByStart(dayInfo[dateISO]?.sessions ?? []);
    // One session: go straight there, as tapping a day always did.
    if (existing.length === 1) {
      router.push(`/roster/${existing[0].id}`);
      return;
    }
    // Several: there is a choice to make, so make it visible instead of
    // guessing. The panel below now lists them.
    if (existing.length > 1) return;

    if (!canEdit) {
      // Was a silent no-op, which reads as the app being broken. Now that the
      // standing "read-only" banner is gone, the moment of the attempt is the
      // only place left to say why nothing happened.
      setDenied("Only an editor can start a session on a new day.");
      return;
    }

    startTransition(async () => {
      const created = await createSessionForDate(dateISO);
      setDayInfo((prev) => ({
        ...prev,
        [dateISO]: {
          sessions: [
            {
              id: created.id,
              startsAt: USUAL_START,
              categoryName: null,
              entries: 0,
              rows: [],
            },
          ],
        },
      }));
      router.push(`/roster/${created.id}`);
    });
  }

  /**
   * A second (or third) session on the selected day.
   *
   * Deliberately not part of tapping the day: adding one is rare and
   * irreversible-ish, and a tap that sometimes opens a session and sometimes
   * creates one is the kind of control people stop trusting.
   */
  function addSessionOnSelectedDay() {
    if (!canEdit) {
      setDenied("Only an editor can add a session.");
      return;
    }
    startTransition(async () => {
      const created = await createSessionForDate(selected, { another: true });
      router.push(`/roster/${created.id}`);
    });
  }

  function navMonth(delta: number) {
    const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + delta, 1));
    setCurrentMonth(monthKey(next));
  }

  function goToday() {
    const today = toISODate(new Date());
    const dt = fromISODate(today);
    setSelected(today);
    setJumpDate(today);
    setCurrentMonth(monthKey(monthStartUTC(dt)));
  }

  function onJumpToDate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!jumpDate) return;
    const dt = fromISODate(jumpDate);
    if (Number.isNaN(dt.getTime())) return;
    setSelected(jumpDate);
    setCurrentMonth(monthKey(monthStartUTC(dt)));
  }

  const selectedInfo = dayInfo[selected];
  const selectedLabel = fromISODate(selected).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const selectedSessions = sortByStart(selectedInfo?.sessions ?? []);
  const selectedHasSession = selectedSessions.length > 0;
  const selectedEntries = selectedSessions.reduce((n, x) => n + x.entries, 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold">
          {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => navMonth(-1)} disabled={isPending}>Prev</Button>
          <Button type="button" onClick={goToday} disabled={isPending}>Today</Button>
          <Button type="button" onClick={() => navMonth(1)} disabled={isPending}>Next</Button>
          <form className="flex items-center gap-2" onSubmit={onJumpToDate}>
            <Input type="date" value={jumpDate} onChange={(e) => setJumpDate(e.target.value)} className="h-10" />
            <Button type="submit" disabled={isPending}>Go</Button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-on-surface-muted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {grid.map((d) => {
          const date = toISODate(d);
          const inMonth = d.getUTCMonth() === monthDate.getUTCMonth();
          const isSelected = date === selected;

          const daySessions = sortByStart(dayInfo[date]?.sessions ?? []);
          const hasSession = daySessions.length > 0;

          return (
            <button
              key={date}
              type="button"
              onClick={() => onDayClick(date)}
              className={[
                "relative rounded-[12px] border px-2 py-2 text-left hover:bg-panel-hover",
                isSelected ? "border-slate-900" : "border-slate-200",
                inMonth ? "bg-panel" : "bg-panel text-slate-400",
              ].join(" ")}
            >
              <div className="text-xs">{d.getUTCDate()}</div>
              {hasSession ? (
                /*
                  One bar per session, side by side, each shaded by how full it
                  is. A single total would say a day is busy without saying it
                  is busy twice — and twice is the part that changes what you
                  do about it.
                */
                <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                  {daySessions.slice(0, 3).map((ds) => (
                    <div
                      key={ds.id}
                      title={sessionLabel(ds)}
                      className={[
                        "h-1.5 rounded-full",
                        daySessions.length > 1 ? "w-2.5" : "w-6",
                        ds.entries >= 8
                          ? "bg-indigo-600/50"
                          : ds.entries >= 4
                            ? "bg-indigo-600/35"
                            : "bg-indigo-600/20",
                      ].join(" ")}
                    />
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/*
        The selected day, laid out the way the list view lays out a session —
        singer, bhajan, pitch in columns — rather than as one run-on sentence
        with the names jammed together. Same component, so the two cannot
        drift apart again.
      */}
      <div className="grid gap-2 rounded-[12px] border border-rule-surface bg-panel p-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold">{selectedLabel}</span>
          <span className="text-[11px] text-on-surface-muted">
            {selectedHasSession
              ? `${selectedEntries} row${selectedEntries === 1 ? "" : "s"}`
              : "no session"}
          </span>
        </div>

        {selectedHasSession ? (
          /*
            One block per session. On the ordinary day there is exactly one and
            this reads as it always did; on a day with a morning and an evening
            it reads as two things, which is what it is. The heading only
            appears when it earns its line.
          */
          <div className="grid gap-3">
            {selectedSessions.map((ds) => (
              <div key={ds.id} className="grid gap-1">
                {hasSeveral(selectedSessions) ? (
                  <div className="flex items-baseline justify-between gap-2 border-b border-rule-surface pb-1">
                    <span className="text-[12px] font-semibold">{sessionLabel(ds)}</span>
                    <span className="text-[11px] text-on-surface-muted">
                      {ds.entries} row{ds.entries === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : null}

                <SessionRows
                  rows={ds.rows ?? []}
                  total={ds.entries}
                  emptyLabel="Session created, nothing rostered on it yet."
                />

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
                  <Link
                    href={`/roster/${ds.id}`}
                    className="text-brass-ink underline underline-offset-2"
                  >
                    Open this session →
                  </Link>
                  <Link
                    href={`/roster/${ds.id}/live`}
                    className="text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                  >
                    ▶ Live view
                  </Link>
                </div>
              </div>
            ))}

            {canEdit ? (
              // Quiet, because a second session on a day is the exception.
              <button
                type="button"
                onClick={() => addSessionOnSelectedDay()}
                disabled={isPending}
                className="justify-self-start text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
              >
                Add another session on this day
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-on-surface-muted">
            {canEdit
              ? "Nothing on this day. Tap it to start a session."
              : "Nothing on this day."}
          </p>
        )}
      </div>

      {denied ? (
        <p
          role="status"
          className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm"
        >
          {denied}
        </p>
      ) : null}

      {isPending ? <div className="text-xs text-on-surface-muted">Loading…</div> : null}
    </div>
  );
}
