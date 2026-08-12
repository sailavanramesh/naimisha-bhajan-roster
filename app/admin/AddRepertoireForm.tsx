"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RepertoireKind } from "@prisma/client";
import { Button, Input } from "@/components/ui";
import { addRepertoireEntry } from "./actions";

/**
 * A coordinator adding a bhajan to somebody's list.
 *
 * A client component only so it can READ the answer. As a plain form action it
 * could not: the server would refuse a duplicate and the page would say
 * nothing at all, which is a quieter version of the bug this guard exists to
 * fix — something not happening, with no indication that it had not.
 *
 * "Add anyway" is here because a coordinator correcting the record has to be
 * able to overrule the guard. It resets after each attempt, so it is never on
 * by accident.
 */
export function AddRepertoireForm({ singerId }: { singerId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [force, setForce] = useState(false);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          fd.set("singerId", singerId);
          if (force) fd.set("force", "1");
          const res = await addRepertoireEntry(fd);
          setForce(false);
          if (res.ok) {
            setMessage({ ok: true, text: `Added ${res.title}.` });
            router.refresh();
          } else {
            setMessage({ ok: false, text: res.message });
          }
        })
      }
      className="grid gap-2 rounded-[12px] border border-rule-surface bg-panel p-3 sm:grid-cols-[1fr_auto_auto]"
    >
      <Input
        name="title"
        placeholder="Bhajan title, exactly as in the masterlist"
        aria-label="Bhajan title"
      />
      <select
        name="kind"
        defaultValue={RepertoireKind.known}
        className="h-11 rounded-[12px] border border-rule-surface bg-field px-3 text-sm"
        aria-label="List"
      >
        {/* Three stages. "Festival" was never a stage — it describes the
            bhajan, and is a flag on the row now. */}
        <option value={RepertoireKind.known}>Knows it</option>
        <option value={RepertoireKind.learning}>Learning</option>
        <option value={RepertoireKind.wantToLearn}>Wants to learn</option>
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>

      <p className="text-xs text-on-surface-muted sm:col-span-3">
        A title that does not match the masterlist is still saved, as free text — ten roster
        titles do not resolve, and dropping them would lose real data. It simply will not link
        through to a bhajan page.
      </p>

      {message ? (
        <p
          role="status"
          className={[
            "text-xs sm:col-span-3",
            message.ok ? "text-brass-ink" : "text-warn",
          ].join(" ")}
        >
          {message.text}
        </p>
      ) : null}

      {message && !message.ok ? (
        <label className="flex items-center gap-2 text-xs text-on-surface-muted sm:col-span-3">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Add it anyway
        </label>
      ) : null}
    </form>
  );
}
