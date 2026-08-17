"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { JOB_LABELS, type SessionJob } from "@/lib/sessionView";
import { setSessionCrew } from "./actions";

const JOBS: SessionJob[] = ["soundEngineer", "micCoordinator"];

/**
 * Who is on sound and who is on mics.
 *
 * Two jobs, several people each — a big program runs with more than one pair of
 * hands at the desk, and nothing here assumes otherwise.
 */
export function ProgramCrew({
  sessionId,
  singers,
  crew,
  canEdit,
}: {
  sessionId: string;
  singers: { id: string; name: string }[];
  crew: { singerId: string; singerName: string; job: SessionJob }[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});

  const set = (singerId: string, job: SessionJob, on: boolean) =>
    startTransition(async () => {
      setError(null);
      const res = await setSessionCrew({ sessionId, singerId, job, on });
      if (!res.ok) setError(res.error);
      else setAdding((a) => ({ ...a, [job]: "" }));
    });

  return (
    <div className="grid gap-4">
      {JOBS.map((job) => {
        const on = crew.filter((c) => c.job === job);
        const free = singers.filter((s) => !on.some((c) => c.singerId === s.id));
        return (
          <div key={job} className="grid gap-1.5">
            <p className="text-xs uppercase tracking-wide text-on-surface-muted">
              {JOB_LABELS[job]}
            </p>

            {on.length === 0 ? (
              <p className="text-sm text-on-surface-muted">Nobody yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {on.map((c) => (
                  <li
                    key={c.singerId}
                    className="flex items-center gap-2 rounded-full border border-rule-surface bg-field px-3 py-1 text-sm"
                  >
                    <span>{c.singerName}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Take ${c.singerName} off ${JOB_LABELS[job].toLowerCase()}`}
                        className="text-on-surface-muted hover:text-warn"
                        onClick={() => set(c.singerId, job, false)}
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && free.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={adding[job] ?? ""}
                  aria-label={`Add somebody to ${JOB_LABELS[job].toLowerCase()}`}
                  className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
                  onChange={(e) => setAdding((a) => ({ ...a, [job]: e.target.value }))}
                >
                  <option value="">Add somebody…</option>
                  {free.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  className="h-9"
                  disabled={pending || !adding[job]}
                  onClick={() => set(adding[job], job, true)}
                >
                  Add
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}

      {error ? (
        <p role="status" className="text-xs text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}
