"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { copyRowsToDate } from "./copyActions";
import { nextThursday } from "@/lib/dates";

export type CopyRow = {
  id: string;
  position: number;
  singerName: string;
  bhajanTitle: string;
  confirmedPitch: string | null;
};

/**
 * Copy rows to another day.
 *
 * Selection first, then a date — the same control whether you want one row, a
 * few, or the lot. "Copy the whole session" is select-all, which is why there
 * is no separate duplicate-session button.
 *
 * Collapsed until asked for, because it is the rarer thing to want on a page
 * whose main job is editing the session in front of you.
 */
export function CopyRowsPanel({
  sessionId,
  rows,
  todayISO,
}: {
  sessionId: string;
  rows: CopyRow[];
  todayISO: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(() => nextThursday(todayISO));
  const [withPitch, setWithPitch] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; href?: string } | null>(null);

  if (rows.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = selected.size === rows.length;

  const copy = () =>
    startTransition(async () => {
      setResult(null);
      const res = await copyRowsToDate({
        sessionId,
        slotIds: [...selected],
        date,
        withPitch,
      });
      if (!res.ok) {
        setResult({ ok: false, message: res.error });
        return;
      }
      setResult({
        ok: true,
        message: `Copied ${res.copied} row${res.copied === 1 ? "" : "s"} to ${date}.`,
        href: `/roster/${res.targetId}`,
      });
      setSelected(new Set());
      router.refresh();
    });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="justify-self-start text-sm text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
      >
        Copy rows to another day
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-[12px] border border-rule-surface bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Copy to another day</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-on-surface-muted underline underline-offset-2"
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          className="inline-flex h-7 items-center rounded-full border border-rule-surface bg-field px-3 hover:border-brass/50"
        >
          {allSelected ? "Select none" : "Select all"}
        </button>
        <span className="text-on-surface-muted">
          {selected.size} of {rows.length} chosen
        </span>
      </div>

      <ul className="grid gap-1">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 text-sm hover:bg-panel-hover">
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="h-4 w-4"
              />
              <span className="font-mono text-xs text-on-surface-muted">{r.position}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.singerName}</span>
                <span className="text-on-surface-muted"> — {r.bhajanTitle}</span>
              </span>
              {r.confirmedPitch ? (
                <span className="shrink-0 font-mono text-xs text-on-surface-muted">
                  {r.confirmedPitch}
                </span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-3 border-t border-rule-surface pt-3">
        <label className="grid gap-1 text-xs text-on-surface-muted">
          To this date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
          />
        </label>

        <label className="flex items-center gap-2 pb-2 text-xs">
          <input
            type="checkbox"
            checked={withPitch}
            onChange={(e) => setWithPitch(e.target.checked)}
            className="h-4 w-4"
          />
          Bring the confirmed pitches
        </label>

        <Button
          type="button"
          variant="primary"
          className="h-9"
          disabled={pending || selected.size === 0}
          onClick={copy}
        >
          {pending ? "Copying…" : `Copy ${selected.size || ""}`.trim()}
        </Button>

        <span className="pb-2 text-[11px] text-on-surface-muted">
          Adds to that day. Nothing already there is changed.
        </span>
      </div>

      {result ? (
        <p
          role="status"
          className={[
            "rounded-[10px] px-3 py-2 text-sm",
            result.ok
              ? "border border-brass/40 bg-brass/[0.08]"
              : "border border-warn/40 bg-warn/[0.08]",
          ].join(" ")}
        >
          {result.message}{" "}
          {result.href ? (
            <Link href={result.href} className="underline underline-offset-2">
              Open that day
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
