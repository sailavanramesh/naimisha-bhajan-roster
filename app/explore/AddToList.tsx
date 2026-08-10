"use client";

import { useState } from "react";
import { RepertoireKind } from "@prisma/client";
import { Button } from "@/components/ui";
import { upsertLearning } from "@/app/my-list/actions";

/**
 * Add a bhajan to a singer's learning list without leaving Explore.
 *
 * The singer picker is INTERIM. Roles come from a shared access link, so the
 * app cannot yet tell two members apart; once Google sign-in lands this becomes
 * "add to my list" with no picker at all.
 */
export function AddToList({
  bhajanTitle,
  singers,
}: {
  bhajanTitle: string;
  singers: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="self-start text-xs text-brass-ink">Added to the list ✓</span>;
  }

  if (!open) {
    return (
      <Button type="button" className="h-9 shrink-0 self-start text-xs" onClick={() => setOpen(true)}>
        Add to a list
      </Button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await upsertLearning(fd);
        setDone(true);
      }}
      className="grid w-full shrink-0 gap-1.5 sm:w-auto"
    >
      <input type="hidden" name="title" value={bhajanTitle} />
      {/* Empty when signed in: the server decides whose list this is, so a
          picker could not change the outcome. */}
      {singers.length > 0 ? (
        <select
          name="singerId"
          required
          defaultValue=""
          className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-xs"
          aria-label="Whose list"
        >
          <option value="" disabled>Whose list…</option>
          {singers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      ) : null}
      <select
        name="kind"
        defaultValue={RepertoireKind.wantToLearn}
        className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-xs"
        aria-label="Status"
      >
        <option value={RepertoireKind.wantToLearn}>Want to learn</option>
        <option value={RepertoireKind.learning}>Learning</option>
        <option value={RepertoireKind.known}>Already know it</option>
      </select>
      <div className="flex gap-1">
        <Button type="submit" variant="primary" className="h-9 text-xs">Add</Button>
        <Button type="button" className="h-9 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
