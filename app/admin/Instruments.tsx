"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import {
  addInstrument,
  moveInstrument,
  renameInstrument,
  setInstrumentActive,
  setInstrumentScope,
} from "./instrumentActions";

export type InstrumentRow = {
  id: string;
  name: string;
  scope: "bhajans" | "program" | "both";
  active: boolean;
  /** How many program items already name it. Retiring is safe; deleting is not. */
  used: number;
  /** How many people are listed as eligible for it, by name. */
  eligible: number;
};

const SCOPE_LABEL: Record<InstrumentRow["scope"], string> = {
  bhajans: "bhajan sessions",
  program: "programs",
  both: "both",
};

/**
 * The instruments the centre plays.
 *
 * Sailavan asked for a managed list rather than free text, and the reason shows
 * up the first time you look for "everything Prithvi has played the violin on":
 * three spellings typed on three evenings are three instruments to every query
 * that matters.
 *
 * Scope keeps the two pickers apart without keeping two lists — a tabla is a
 * tabla whichever kind of evening it is, and marking it `both` says so once.
 */
export function Instruments({
  instruments,
  canEdit,
}: {
  instruments: InstrumentRow[];
  canEdit: boolean;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<InstrumentRow["scope"]>("program");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const say = (res: { ok: boolean; error?: string }, good: string) =>
    setMessage(res.ok ? { ok: true, text: good } : { ok: false, text: res.error ?? "Failed." });

  const add = () =>
    startTransition(async () => {
      const res = await addInstrument({ name, scope });
      say(res, `Added "${name.trim()}".`);
      if (res.ok) setName("");
    });

  const commitRename = () =>
    startTransition(async () => {
      if (!editing) return;
      const res = await renameInstrument(editing);
      say(res, `Renamed to "${editing.name.trim()}".`);
      if (res.ok) setEditing(null);
    });

  const active = instruments.filter((i) => i.active);
  const retired = instruments.filter((i) => !i.active);

  return (
    <div className="grid gap-3">
      <ul className="grid gap-1">
        {active.length === 0 ? (
          <li className="text-sm text-on-surface-muted">None yet.</li>
        ) : (
          active.map((i, index) => (
            <li
              key={i.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[8px] px-2 py-1 text-sm odd:bg-surface/60 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
            >
              {editing?.id === i.id ? (
                <span className="flex items-center gap-2">
                  <Input
                    value={editing.name}
                    autoFocus
                    onChange={(e) => setEditing({ id: i.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    aria-label={`Rename ${i.name}`}
                    className="h-8 w-44"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    className="h-8 text-xs"
                    disabled={pending || editing.name.trim().length === 0}
                    onClick={commitRename}
                  >
                    Save
                  </Button>
                  <button
                    type="button"
                    className="text-[11px] text-on-surface-muted underline underline-offset-2"
                    onClick={() => setEditing(null)}
                  >
                    cancel
                  </button>
                </span>
              ) : (
                <span className="min-w-0 truncate font-medium">
                  {i.name}
                  <span className="ml-2 text-xs font-normal text-on-surface-muted">
                    {SCOPE_LABEL[i.scope]}
                    {i.eligible > 0 ? ` · ${i.eligible} eligible` : ""}
                    {i.used > 0 ? ` · on ${i.used} item${i.used === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
              )}

              {canEdit && editing?.id !== i.id ? (
                <>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move ${i.name} up`}
                      disabled={pending || index === 0}
                      className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
                      onClick={() =>
                        startTransition(async () => {
                          await moveInstrument({ id: i.id, direction: "up" });
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${i.name} down`}
                      disabled={pending || index === active.length - 1}
                      className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
                      onClick={() =>
                        startTransition(async () => {
                          await moveInstrument({ id: i.id, direction: "down" });
                        })
                      }
                    >
                      ↓
                    </button>
                  </span>

                  <span className="flex items-center gap-2">
                    <select
                      value={i.scope}
                      aria-label={`Where ${i.name} is offered`}
                      disabled={pending}
                      className="h-8 rounded-key border border-rule-surface bg-field px-2 text-xs"
                      onChange={(e) =>
                        startTransition(async () => {
                          const res = await setInstrumentScope({
                            id: i.id,
                            scope: e.target.value as InstrumentRow["scope"],
                          });
                          say(res, `${i.name} now offered for ${SCOPE_LABEL[
                            e.target.value as InstrumentRow["scope"]
                          ]}.`);
                        })
                      }
                    >
                      <option value="program">programs</option>
                      <option value="bhajans">bhajan sessions</option>
                      <option value="both">both</option>
                    </select>
                    <button
                      type="button"
                      className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                      onClick={() => setEditing({ id: i.id, name: i.name })}
                    >
                      rename
                    </button>
                    <Button
                      type="button"
                      variant="danger"
                      className="h-8 text-xs"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await setInstrumentActive({ id: i.id, active: false });
                          say(
                            res,
                            res.ok && res.usedBy > 0
                              ? `Retired "${i.name}". The ${res.usedBy} item${res.usedBy === 1 ? "" : "s"} that used it still say so.`
                              : `Retired "${i.name}".`,
                          );
                        })
                      }
                    >
                      Retire
                    </Button>
                  </span>
                </>
              ) : editing?.id !== i.id ? (
                <span className="col-span-2" />
              ) : null}
            </li>
          ))
        )}
      </ul>

      {retired.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-xs uppercase tracking-wide text-on-surface-muted">Put away</p>
          <ul className="flex flex-wrap gap-2">
            {retired.map((i) => (
              <li key={i.id} className="flex items-center gap-1 text-sm text-on-surface-muted">
                <span>{i.name}</span>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="text-[11px] underline underline-offset-2 hover:text-on-surface"
                    onClick={() =>
                      startTransition(async () => {
                        const res = await setInstrumentActive({ id: i.id, active: true });
                        say(res, `Brought "${i.name}" back.`);
                      })
                    }
                  >
                    bring back
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New instrument, e.g. Mridangam"
            aria-label="New instrument"
            className="h-9 w-56"
          />
          <select
            value={scope}
            aria-label="Where the new instrument is offered"
            className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
            onChange={(e) => setScope(e.target.value as InstrumentRow["scope"])}
          >
            <option value="program">programs</option>
            <option value="bhajans">bhajan sessions</option>
            <option value="both">both</option>
          </select>
          <Button
            type="button"
            variant="primary"
            className="h-9"
            disabled={pending || name.trim().length === 0}
            onClick={add}
          >
            Add
          </Button>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={message.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
