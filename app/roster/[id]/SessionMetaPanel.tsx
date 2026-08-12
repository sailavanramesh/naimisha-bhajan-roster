"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { updateSessionMeta } from "./metaActions";

export type SessionMeta = {
  categoryId: string | null;
  topic: string | null;
  /** "HH:MM" or null. */
  startsAt: string | null;
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
  initial,
  canEdit,
}: {
  sessionId: string;
  categories: { id: string; name: string }[];
  initial: SessionMeta;
  canEdit: boolean;
}) {
  const [value, setValue] = useState<SessionMeta>(initial);
  const [saved, setSaved] = useState<SessionMeta>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const summary = describe(saved, categories);

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await updateSessionMeta({
        sessionId,
        categoryId: value.categoryId ?? "",
        topic: value.topic ?? "",
        startsAt: value.startsAt ?? "",
      });
      if (res.ok) setSaved(value);
      else setError(res.error);
    });

  if (!canEdit) {
    return summary ? <p className="text-xs text-on-surface-muted">{summary}</p> : null;
  }

  return (
    <details className="rounded-[12px] border border-rule-surface bg-panel">
      <summary className="flex cursor-pointer select-none items-baseline justify-between gap-3 px-4 py-3 text-sm font-semibold">
        <span>Session details</span>
        <span className="truncate text-xs font-normal text-on-surface-muted">
          {summary || "not recorded"}
        </span>
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

          <label className="grid gap-1 text-[11px] text-on-surface-muted">
            Starts
            <input
              type="time"
              value={value.startsAt ?? ""}
              onChange={(e) => setValue((v) => ({ ...v, startsAt: e.target.value || null }))}
              className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
            />
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

/** "Routine Thursday · 7:00pm · Guru Purnima", skipping whatever is absent. */
function describe(meta: SessionMeta, categories: { id: string; name: string }[]): string {
  const parts = [
    categories.find((c) => c.id === meta.categoryId)?.name,
    meta.startsAt ? clock(meta.startsAt) : null,
    meta.topic,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** "19:00" → "7:00pm". The group does not read 24-hour time. */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}
