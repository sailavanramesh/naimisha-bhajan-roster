"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { updateSessionMeta } from "./metaActions";
import { TimeZoneSelect } from "@/components/TimeZoneSelect";
import { CENTRE_TIME_ZONE } from "@/lib/timezones";
import { SessionTime } from "@/components/SessionTime";

export type SessionMeta = {
  categoryId: string | null;
  topic: string | null;
  location: string | null;
  /** "HH:MM" or null. */
  startsAt: string | null;
  /** Whose clock `startsAt` is on. An IANA zone. See Session.timeZone. */
  timeZone: string;
  /** Not on a sound desk at all: unamplified, no cushions. */
  noDesk: boolean;
  /** Is there a mic on the tabla? */
  tablaMicd: boolean;
  /** "YYYY-MM-DD". The day this session is on, and can be moved to. */
  date: string;
};

/**
 * What kind of session, what it was about, and when it started.
 *
 * Collapsed, and quiet. Sailavan: "important for completeness and training",
 * not for the day-to-day — the roster works without any of it, and most people
 * opening a session are there to fix a pitch. So it costs one line until it is
 * wanted, and the line already says what is recorded, which is the part
 * anybody reading the page benefits from.
 */
export function SessionMetaPanel({
  sessionId,
  categories,
  places,
  initial,
  canEdit,
}: {
  sessionId: string;
  categories: { id: string; name: string }[];
  /** Venues already used, offered as suggestions rather than a fixed list. */
  places: string[];
  initial: SessionMeta;
  canEdit: boolean;
}) {
  const [value, setValue] = useState<SessionMeta>(initial);
  const [saved, setSaved] = useState<SessionMeta>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const summary = describe(saved, categories);
  const hasSummary = summary.length > 0;
  /** What is SAVED, not what is being typed — the chip must not flicker mid-edit. */
  const needsKind = !saved.categoryId;

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await updateSessionMeta({
        sessionId,
        categoryId: value.categoryId ?? "",
        topic: value.topic ?? "",
        location: value.location ?? "",
        startsAt: value.startsAt ?? "",
        timeZone: value.timeZone || CENTRE_TIME_ZONE,
        noDesk: value.noDesk,
        tablaMicd: value.tablaMicd,
        // Was missed when the date became editable, and the whole form stopped
        // saving: the action requires it, so every submit failed validation with
        // a bare "Required" that named no field and pointed at nothing on screen.
        date: value.date,
      });
      if (res.ok) setSaved(value);
      else setError(res.error);
    });

  if (!canEdit) {
    return hasSummary ? (
      <p className="text-xs text-on-surface-muted">
        <Joined parts={summary} />
      </p>
    ) : null;
  }

  return (
    <details className="rounded-[12px] border border-rule-surface bg-panel">
      <summary className="flex cursor-pointer select-none items-baseline justify-between gap-3 px-4 py-3 text-sm font-semibold">
        <span>Session details</span>
        {/*
          A session with no KIND says so, here, and is not interrupted about it.

          Sailavan built one on 18 August and it was nearly invisible on the
          calendar — fixed there with a "?" mark. This is the other half: the
          place you would go to fix it now says it needs fixing.

          Deliberately not a dialog on the way out. This session is already
          saved; nothing is lost by leaving. The app has one leave-dialog
          already, for genuinely unsaved work, and it earns its interruption
          because data would go. A second one that looks the same but means
          "you forgot a label" is how people learn to click through both — and
          the one that must not be dismissed is the other one.
        */}
        {needsKind ? (
          <span className="shrink-0 rounded-key border border-brass/60 px-2 py-0.5 text-[11px] font-semibold text-brass-ink">
            Kind not set
          </span>
        ) : (
          <span className="truncate text-xs font-normal text-on-surface-muted">
            {hasSummary ? <Joined parts={summary} /> : "not recorded"}
          </span>
        )}
      </summary>

      <div className="grid gap-3 px-4 pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[11px] text-on-surface-muted">
            Kind of session
            <select
              value={value.categoryId ?? ""}
              onChange={(e) => setValue((v) => ({ ...v, categoryId: e.target.value || null }))}
              className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {/*
            The DATE, editable.

            Sailavan, 2026-08-17: a session put on the wrong day should be
            movable "in case it's wrong". It was not, and the only cure was to
            delete and rebuild — which throws away the roster along with the
            mistake.
          */}
          <label className="grid gap-1 text-[11px] text-on-surface-muted">
            Date
            <input
              type="date"
              value={value.date}
              onChange={(e) => setValue((v) => ({ ...v, date: e.target.value || v.date }))}
              className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
            />
          </label>

          <label className="grid gap-1 text-[11px] text-on-surface-muted">
            Starts
            <input
              type="time"
              value={value.startsAt ?? ""}
              onChange={(e) => setValue((v) => ({ ...v, startsAt: e.target.value || null }))}
              className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
            />
          </label>

          {/*
            Next to the time, not somewhere else on the form. The two are one
            fact — "7pm" is not a time until you say whose clock it is on — and
            splitting them is how a session ends up on the right hour in the
            wrong city.
          */}
          <label className="grid gap-1 text-[11px] text-on-surface-muted">
            Time zone
            <TimeZoneSelect
              value={value.timeZone || CENTRE_TIME_ZONE}
              onChange={(zone) => setValue((v) => ({ ...v, timeZone: zone }))}
            />
          </label>

          <label className="grid min-w-[10rem] flex-1 gap-1 text-[11px] text-on-surface-muted">
            Where
            <input
              type="text"
              list="session-places"
              value={value.location ?? ""}
              placeholder="The centre, a home, a hall…"
              onChange={(e) => setValue((v) => ({ ...v, location: e.target.value }))}
              className="h-9 w-full rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface placeholder:text-on-surface-muted"
            />
            <datalist id="session-places">
              {places.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>

          {/*
            The sound of the room, in two answers.

            Beside the venue rather than in the desk admin, because both are
            facts about THIS session — the desk describes the hardware, and
            whether tonight uses it is a different question. Checkboxes rather
            than a select: each is a plain yes or no, and the unticked state is
            the ordinary one for both.
          */}
          <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-on-surface-muted">
            <input
              type="checkbox"
              checked={value.noDesk}
              onChange={(e) => setValue((v) => ({ ...v, noDesk: e.target.checked }))}
              className="h-3.5 w-3.5"
            />
            No sound desk
          </label>

          <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-on-surface-muted">
            <input
              type="checkbox"
              checked={value.tablaMicd}
              onChange={(e) => setValue((v) => ({ ...v, tablaMicd: e.target.checked }))}
              className="h-3.5 w-3.5"
              disabled={value.noDesk}
            />
            Tabla is mic&rsquo;d
          </label>

          <label className="grid min-w-[12rem] flex-1 gap-1 text-[11px] text-on-surface-muted">
            Topic
            <input
              type="text"
              value={value.topic ?? ""}
              placeholder="Festival name, theme, visiting speaker…"
              onChange={(e) => setValue((v) => ({ ...v, topic: e.target.value }))}
              className="h-9 w-full rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface placeholder:text-on-surface-muted"
            />
          </label>

          <Button type="button" variant="primary" className="h-9" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-warn">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/** "Routine Thursday · 7pm · the centre · Guru Purnima", skipping what is absent. */
/**
 * The one-line version of all this, for the collapsed header.
 *
 * Returns PARTS rather than a joined string, because one of them is no longer
 * text: the start time is a `SessionTime`, which adds the reader's own time
 * after mount when their clock differs from the venue's. The header deliberately
 * does not carry the time — "that belongs to whoever is planning, and the
 * details panel carries it" — so this line is where a member reading from
 * another timezone finds out when the session actually is for them.
 */
function describe(
  meta: SessionMeta,
  categories: { id: string; name: string }[],
): React.ReactNode[] {
  return [
    categories.find((c) => c.id === meta.categoryId)?.name,
    meta.startsAt ? (
      <SessionTime
        key="time"
        dateISO={meta.date}
        startsAt={meta.startsAt}
        timeZone={meta.timeZone || CENTRE_TIME_ZONE}
      />
    ) : null,
    meta.location,
    meta.topic,
    // Worth a word on the line, because it changes what the session IS. The
    // tabla mic is not: that is desk detail, and this line already carries
    // five things.
    meta.noDesk ? "no sound desk" : null,
  ].filter(Boolean);
}

/** The parts of the summary, separated the way the rest of the app separates. */
function Joined({ parts }: { parts: React.ReactNode[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 ? " · " : null}
          {part}
        </span>
      ))}
    </>
  );
}
