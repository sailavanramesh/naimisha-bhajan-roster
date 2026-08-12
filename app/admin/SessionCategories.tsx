"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { addSessionCategory, removeSessionCategory } from "@/app/roster/[id]/metaActions";

/**
 * The kinds of session the centre runs.
 *
 * A table rather than an enum precisely so this screen can exist: Sailavan
 * said he would create the categories himself, and a vocabulary the group owns
 * should not need a deploy to change.
 *
 * Removing one leaves its sessions alone — they simply become uncategorised —
 * so the confirm says how many that is rather than warning about nothing.
 */
export function SessionCategories({
  categories,
  canEdit,
}: {
  categories: { id: string; name: string; sessions: number }[];
  canEdit: boolean;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const add = () =>
    startTransition(async () => {
      const res = await addSessionCategory(name);
      setMessage(res.ok ? { ok: true, text: `Added "${name}".` } : { ok: false, text: res.error });
      if (res.ok) setName("");
    });

  const remove = (id: string, label: string) =>
    startTransition(async () => {
      const res = await removeSessionCategory(id);
      setMessage(
        res.ok
          ? {
              ok: true,
              text:
                res.freed === 0
                  ? `Removed "${label}".`
                  : `Removed "${label}". ${res.freed} session${res.freed === 1 ? " is" : "s are"} now uncategorised.`,
            }
          : { ok: false, text: res.error },
      );
    });

  return (
    <div className="grid gap-2">
      <ul className="grid gap-1">
        {categories.length === 0 ? (
          <li className="text-sm text-on-surface-muted">None yet.</li>
        ) : (
          categories.map((c) => (
            <li
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-[8px] px-2 py-1 text-sm odd:bg-surface/60"
            >
              <span className="truncate font-medium">{c.name}</span>
              <span className="whitespace-nowrap text-xs text-on-surface-muted">
                {c.sessions === 0 ? "unused" : `${c.sessions} session${c.sessions === 1 ? "" : "s"}`}
              </span>
              {canEdit ? (
                <Button
                  type="button"
                  variant="danger"
                  className="h-8 text-xs"
                  disabled={pending}
                  onClick={() => remove(c.id, c.name)}
                >
                  Remove
                </Button>
              ) : (
                <span />
              )}
            </li>
          ))
        )}
      </ul>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category, e.g. Ladies Day"
            aria-label="New session category"
            className="h-9 w-56"
          />
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
