"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SessionRows } from "@/components/SessionRows";
import { Button, Input } from "@/components/ui";
import { fetchMonthInfo, createSessionForDate } from "./calendarActions";
import { sortByStart, sessionLabel, hasSeveral, USUAL_START } from "@/lib/sessionsOfDay";
import { deviceTodayISO } from "@/lib/dates";
import { countTap, type Tap } from "@/lib/doubleTap";
import {
  dayMarks,
  dayKindLabel,
  fullnessStep,
  sessionCountLabel,
  dayTooltip,
  type KindLite,
} from "@/lib/categoryMark";

type DaySession = {
  id: string;
  startsAt: string | null;
  categoryId: string | null;
  categoryName: string | null;
  entries: number;
  rows?: { singer: string; bhajan: string | null; pitch: string | null }[];
  /** See Session.format. Absent from an older response is read as bhajans. */
  format?: "bhajans" | "program";
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

/**
 * A UTC-anchored Date back to its `YYYY-MM-DD`.
 *
 * Correct for every Date in this file, because they are all built with
 * `Date.UTC` and carry a calendar date rather than a moment. NOT correct for
 * `new Date()`, which is a moment: that is how the Today button came to select
 * Tuesday on a Wednesday morning in Melbourne, since the server and the phone
 * were both still on Tuesday in UTC. Ask `deviceTodayISO` for today instead.
 */
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
  /**
   * Did `initialSelected` come from the url, or is it just "today"?
   *
   * The difference decides whether this component may move off it. A day in the
   * url is a deliberate choice — somebody linked to it, or navigated there —
   * and must survive. A defaulted today is the server's best guess made in
   * Melbourne, because the server cannot know where the reader is, and the
   * reader's own device can improve on it.
   */
  selectedFromUrl: boolean;
  initialDayInfo: Record<string, DayInfo>;
  /**
   * Every kind of session, without its picture — a few rows, a few hundred
   * bytes. The pictures come one at a time from a cacheable route, so a month
   * of fifty sessions costs one request per kind rather than fifty copies of
   * a 47KB data URL.
   */
  kinds: KindLite[];
}) {
  const { canEdit, initialMonth, initialSelected, selectedFromUrl, initialDayInfo } = props;
  const kindsById = useMemo(
    () => new Map(props.kinds.map((k) => [k.id, k])),
    [props.kinds],
  );
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

  /*
   * Land on the reader's own today, once, on arrival.
   *
   * The server rendered Melbourne's date, which is the right guess to make
   * without knowing where the reader is and is what everybody at the centre
   * sees. A member reading this from another timezone can be on a different
   * day, though, and their device knows which — so if the two disagree, theirs
   * wins.
   *
   * Only when the day was NOT asked for by url: a linked day is a decision
   * somebody made and is not ours to overrule. Only on mount, so it never
   * fights a later choice. In Melbourne the two agree and nothing happens.
   */
  useEffect(() => {
    if (selectedFromUrl) return;
    const deviceToday = deviceTodayISO();
    if (deviceToday === initialSelected) return;
    setSelected(deviceToday);
    setJumpDate(deviceToday);
    setCurrentMonth(monthKey(monthStartUTC(fromISODate(deviceToday))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /*
   * ONE TAP SELECTS, TWO TAPS OPEN.
   *
   * A single tap used to navigate straight into the day's session, which made
   * the calendar unusable for the thing it is best at. Sailavan, 2026-08-31:
   * "its hard to scan through future rostered sessions in that view" — every
   * glance at next Thursday cost a page load and a trip back. So a tap now
   * only moves the selection, and the panel below answers the question; going
   * in is a deliberate second tap, or the "Open this session" link that has
   * always been there.
   *
   * The counting is in lib/doubleTap.ts, where its edges can be tested — a
   * third tap, a pair split across two days, a pair that straddles the window.
   * Not onDoubleClick, because `dblclick` is not something to rely on under a
   * finger: iOS reserves the double tap for zoom and fires the event late or
   * not at all. The cells carry `touch-manipulation` to take that gesture out
   * of the way.
   */
  const lastTapRef = useRef<Tap | null>(null);

  async function onDayClick(dateISO: string) {
    setSelected(dateISO);
    setJumpDate(dateISO);
    // A refusal from an earlier day should not still be on screen while
    // somebody reads a different one.
    setDenied(null);

    const { open, next } = countTap(lastTapRef.current, dateISO, Date.now());
    lastTapRef.current = next;
    if (!open) return;

    const existing = sortByStart(dayInfo[dateISO]?.sessions ?? []);
    // One session: go straight there, as a double tap on a day now does.
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
              // A session just created has no kind yet, so no mark.
              categoryId: null,
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

  /**
   * A music program on the selected day.
   *
   * Always a new one, and it can sit alongside the bhajan session that day —
   * which is the ordinary case, not the exception: the offering happens on the
   * evening the group is already meeting.
   */
  function addProgramOnSelectedDay() {
    if (!canEdit) {
      setDenied("Only an editor can start a music program.");
      return;
    }
    startTransition(async () => {
      const created = await createSessionForDate(selected, { format: "program" });
      router.push(`/program/${created.id}`);
    });
  }

  function navMonth(delta: number) {
    const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + delta, 1));
    setCurrentMonth(monthKey(next));
  }

  function goToday() {
    // The DEVICE's today, not UTC's and not the server's — somebody pressing
    // this means the day they are living in.
    const today = deviceTodayISO();
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
  /*
   * "en-AU", not the runtime default.
   *
   * `undefined` asks whichever engine is formatting for ITS locale, and the two
   * engines here do not agree: Node rendered "Sunday, 16 August 2026" and the
   * browser "Sunday 16 August 2026", one comma apart, which is enough for React
   * to fail hydration and throw away this whole tree on every visit to /roster.
   * The group is in Melbourne and every other date in the app is already
   * formatted en-AU, so saying so fixes the mismatch and changes nothing a
   * reader sees.
   */
  const selectedLabel = fromISODate(selected).toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    // `fromISODate` anchors to UTC midnight, so read it back in UTC. Without
    // this the label names the previous day for any reader west of UTC.
    timeZone: "UTC",
  });
  const selectedSessions = sortByStart(selectedInfo?.sessions ?? []);
  const selectedHasSession = selectedSessions.length > 0;
  const selectedEntries = selectedSessions.reduce((n, x) => n + x.entries, 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold">
          {/* UTC, like every other label here: `monthDate` is the 1st at UTC
              midnight, which reads as the month BEFORE west of UTC. */}
          {monthDate.toLocaleDateString("en-AU", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
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
          const { marks, overflow } = dayMarks(daySessions, kindsById);
          const rows = daySessions.reduce((n, s) => n + s.entries, 0);
          const step = fullnessStep(rows);
          const kindLabel = [dayKindLabel(marks, overflow), sessionCountLabel(daySessions)]
            .filter(Boolean)
            .join(" ");
          // A session nobody has rostered yet gets no wash, so the date itself
          // has to say the day is not empty — see the wash below.
          const awaitingRoster = hasSession && rows === 0;

          return (
            <button
              key={date}
              type="button"
              onClick={() => onDayClick(date)}
              title={dayTooltip(marks, rows, daySessions.length)}
              className={[
                // `touch-manipulation` so iOS does not answer the second tap
                // with a zoom, `select-none` so a desktop double click does
                // not leave the date highlighted behind the navigation.
                "relative touch-manipulation select-none rounded-[12px] border px-2 py-2 text-left hover:bg-panel-hover",
                isSelected ? "border-slate-900" : "border-slate-200",
                inMonth ? "bg-panel" : "bg-panel text-slate-400",
              ].join(" ")}
            >
              {/*
                HOW FULL THE DAY IS, as the cell's own background.

                This was a small coloured bar under the date. Once the cell also
                carried the kind's picture and its name, three things were
                competing for about forty pixels — "looks congested", and it
                did. A wash adds nothing to the cell: the day simply deepens as
                it fills, and a month reads as a pattern rather than as a row of
                marks to decode.

                An overlay rather than a background class, so `hover:bg-panel-hover`
                still shows through underneath and the cell keeps feeling like a
                button. Sits behind the content, which is why everything below is
                in its own `relative` layer.
              */}
              {step > 0 ? (
                <span
                  aria-hidden
                  className={[
                    "pointer-events-none absolute inset-0 rounded-[12px]",
                    step === 1 ? "bg-brass/[0.07]" : step === 2 ? "bg-brass/[0.14]" : "bg-brass/[0.22]",
                  ].join(" ")}
                />
              ) : null}

              <span className="relative block">
              {/*
                The date, and what kind of session the day holds.

                The bar below stays: it says how FULL the day is, which is a
                different question from what kind of thing it is. The mark
                answers the second one — the kind's own picture, because at
                this size a picture is the only honest way to say "Ramayana"
                (the live view's rail reached the same conclusion). The name
                is in the tooltip, and on a wide enough screen it also gets a
                line of its own under the date.
              */}
              <span className="flex items-start justify-between gap-1">
                <span
                  className={[
                    "text-xs",
                    // No wash means an empty day OR a session with nobody on
                    // it. The date says which — this is the day a coordinator
                    // is looking for.
                    awaitingRoster ? "font-semibold text-brass-ink underline decoration-dotted underline-offset-2" : "",
                  ].join(" ")}
                >
                  {d.getUTCDate()}
                </span>
                {marks.length > 0 ? (
                  <span className="flex shrink-0 items-center -space-x-1">
                    {marks.map((m) =>
                      m.src ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          key={m.id ?? "none"}
                          src={m.src}
                          alt=""
                          title={m.count > 1 ? `${m.name} ×${m.count}` : m.name}
                          loading="lazy"
                          className="h-4 w-4 rounded-full border border-rule bg-panel object-cover sm:h-5 sm:w-5"
                        />
                      ) : (
                        <span
                          key={m.id ?? "none"}
                          title={m.count > 1 ? `${m.name} ×${m.count}` : m.name}
                          className="grid h-4 w-4 place-items-center rounded-full border border-rule bg-brass/15 text-[7px] font-semibold text-on-surface-muted sm:h-5 sm:w-5 sm:text-[8px]"
                        >
                          {m.initials}
                        </span>
                      ),
                    )}
                    {overflow > 0 ? (
                      <span className="pl-1 text-[9px] text-on-surface-muted">+{overflow}</span>
                    ) : null}
                  </span>
                ) : null}
              </span>

              {/* Room for the name only where there is room for the name. */}
              {kindLabel ? (
                <span className="mt-0.5 hidden truncate text-[10px] leading-tight text-on-surface-muted sm:block">
                  {kindLabel}
                </span>
              ) : null}
              </span>

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

                {ds.format === "program" ? (
                  // A program has items, not rostered rows, so there is
                  // nothing for SessionRows to show — and inventing a row per
                  // item here would mean two places to keep in step.
                  <p className="text-[12px] text-on-surface-muted">
                    Music program · {ds.entries} item{ds.entries === 1 ? "" : "s"}
                  </p>
                ) : (
                  <SessionRows
                    rows={ds.rows ?? []}
                    total={ds.entries}
                    emptyLabel="Session created, nothing rostered on it yet."
                  />
                )}

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
                  <Link
                    href={ds.format === "program" ? `/program/${ds.id}` : `/roster/${ds.id}`}
                    className="text-brass-ink underline underline-offset-2"
                  >
                    {ds.format === "program" ? "Open this program →" : "Open this session →"}
                  </Link>
                  {ds.format === "program" ? null : (
                    <Link
                      href={`/roster/${ds.id}/live`}
                      className="text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                    >
                      ▶ Live view
                    </Link>
                  )}
                </div>
              </div>
            ))}

            {canEdit ? (
              // Quiet, because a second session on a day is the exception —
              // and so is a program, which is why both sit down here rather
              // than competing with the sessions above them.
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => addSessionOnSelectedDay()}
                  disabled={isPending}
                  className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                >
                  Add another session on this day
                </button>
                <button
                  type="button"
                  onClick={() => addProgramOnSelectedDay()}
                  disabled={isPending}
                  className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                >
                  Start a music program
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid justify-items-start gap-2">
            <p className="text-on-surface-muted">
              {canEdit
                ? "Nothing on this day. Double-tap it to start a session."
                : "Nothing on this day."}
            </p>
            {canEdit ? (
              <button
                type="button"
                onClick={() => addProgramOnSelectedDay()}
                disabled={isPending}
                className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
              >
                Start a music program
              </button>
            ) : null}
          </div>
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
