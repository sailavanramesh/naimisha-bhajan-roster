"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { bulkUpdateSessionMeta } from "@/app/roster/[id]/metaActions";
import { timeLabel } from "@/lib/sessionsOfDay";

export type BulkSession = {
  id: string;
  dateISO: string;
  weekday: string;
  startsAt: string | null;
  categoryId: string | null;
  categoryName: string | null;
  topic: string | null;
  entries: number;
};

/**
 * Set what kind of session many sessions were, in one go.
 *
 * Sailavan is backfilling this for 214 sessions from records kept outside the
 * app; one at a time is four clicks each. Nothing here touches a roster — only
 * the labels on it — which is why it can be a flat list with checkboxes rather
 * than anything cleverer.
 *
 * "Leave as is" is the default on every field. Stamping the kind on thirty
 * Sundays must not blank thirty topics on the way past, so a field nobody
 * touched is not sent at all.
 */
export function BulkMetaPanel({
  sessions,
  categories,
}: {
  sessions: BulkSession[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [touchTopic, setTouchTopic] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Select every session currently listed, or none. */
  const allShown = sessions.length > 0 && sessions.every((s) => selected.has(s.id));
  const toggleAll = () =>
    setSelected(allShown ? new Set() : new Set(sessions.map((s) => s.id)));

  /** The quick picks that make this worth using at all. */
  const selectWhere = (fn: (s: BulkSession) => boolean) =>
    setSelected(new Set(sessions.filter(fn).map((s) => s.id)));

  const weekdays = useMemo(
    () => [...new Set(sessions.map((s) => s.weekday))],
    [sessions],
  );

  const apply = () =>
    startTransition(async () => {
      setResult(null);
      const res = await bulkUpdateSessionMeta({
        sessionIds: [...selected],
        // Absent means leave alone; "" means clear.
        ...(categoryId === "" ? {} : { categoryId: categoryId === "__clear__" ? "" : categoryId }),
        ...(startsAt === "" ? {} : { startsAt }),
        ...(touchTopic ? { topic } : {}),
      });
      if (!res.ok) {
        setResult({ ok: false, text: res.error });
        return;
      }
      setResult({
        ok: true,
        text: `Set ${res.fields.join(" and ")} on ${res.updated} session${res.updated === 1 ? "" : "s"}.`,
      });
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      {/* What to change. Sticky so it stays reachable down a long list. */}
      <div className="sticky top-0 z-10 grid gap-2 rounded-[12px] border border-rule-surface bg-panel p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[11px] text-on-surface-muted">
            Kind
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
            >
              <option value="">leave as is</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__clear__">— clear it —</option>
            </select>
          </label>

          <label className="grid gap-1 text-[11px] text-on-surface-muted">
            Starts
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
            />
          </label>

          <label className="grid min-w-[14rem] flex-1 gap-1 text-[11px] text-on-surface-muted">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={touchTopic}
                onChange={(e) => setTouchTopic(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Also set the topic
            </span>
            <input
              type="text"
              value={topic}
              disabled={!touchTopic}
              placeholder="Same topic for all of them"
              onChange={(e) => setTopic(e.target.value)}
              className="h-9 w-full rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface disabled:opacity-50"
            />
          </label>

          <Button
            type="button"
            variant="primary"
            className="h-9"
            disabled={pending || selected.size === 0}
            onClick={apply}
          >
            {pending ? "Saving…" : `Apply to ${selected.size || "…"}`}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-on-surface-muted">{selected.size} chosen ·</span>
          <button type="button" onClick={toggleAll} className="underline underline-offset-2">
            {allShown ? "none" : `all ${sessions.length}`}
          </button>
          <button
            type="button"
            onClick={() => selectWhere((s) => !s.categoryId)}
            className="underline underline-offset-2"
          >
            uncategorised
          </button>
          {weekdays.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => selectWhere((s) => s.weekday === w)}
              className="underline underline-offset-2"
            >
              {w}s
            </button>
          ))}
        </div>

        {result ? (
          <p role="status" className={result.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
            {result.text}
          </p>
        ) : null}
      </div>

      <ul className="grid gap-0.5">
        {sessions.length === 0 ? (
          <li className="text-sm text-on-surface-muted">No sessions in that range.</li>
        ) : (
          sessions.map((s) => (
            <li key={s.id}>
              <label
                className={[
                  "grid cursor-pointer grid-cols-[1.25rem_6.5rem_1fr] items-center gap-x-3 rounded-[8px] px-2 py-1 text-sm hover:bg-panel-hover sm:grid-cols-[1.25rem_6.5rem_9rem_4rem_minmax(0,1fr)_3.5rem]",
                  selected.has(s.id) ? "bg-brass/[0.08]" : "odd:bg-surface/60",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4"
                />
                <span className="font-mono text-xs">{s.dateISO}</span>
                <span className="col-span-2 truncate text-xs sm:col-span-1">
                  {s.categoryName ?? <span className="text-on-surface-muted">—</span>}
                </span>
                <span className="hidden font-mono text-xs text-on-surface-muted sm:block">
                  {timeLabel(s.startsAt) || "—"}
                </span>
                <span className="hidden truncate text-xs text-on-surface-muted sm:block">
                  {s.topic ?? ""}
                </span>
                <span className="hidden text-right text-xs text-on-surface-muted sm:block">
                  <Link
                    href={`/roster/${s.id}`}
                    className="underline underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {s.entries || "0"} row{s.entries === 1 ? "" : "s"}
                  </Link>
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
