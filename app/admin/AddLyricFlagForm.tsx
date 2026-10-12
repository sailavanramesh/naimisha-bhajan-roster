"use client";

import { useActionState } from "react";
import { Input, Button } from "@/components/ui";
import { addLyricFlag, type AddLyricFlagState } from "./actions";

/**
 * Add a word or phrase to flag. A client form so a mistake (a blank term, an
 * end before the start) is shown by name — see AddPersonForm.
 */
export function AddLyricFlagForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState<AddLyricFlagState, FormData>(addLyricFlag, {});

  return (
    <div className="grid gap-2">
      <form
        action={formAction}
        key={state.added ?? "empty"}
        className="grid items-end gap-2 rounded-[12px] border border-brass/35 bg-brass/[0.05] p-3 sm:grid-cols-[1fr_1fr_9rem_9rem_auto]"
      >
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">Word or phrase</span>
          <Input name="term" required maxLength={100} placeholder="e.g. ram" />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">Why (optional)</span>
          <Input name="note" maxLength={200} placeholder="Shown with the flag" />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">From</span>
          <input
            type="date"
            name="startsOn"
            required
            defaultValue={today}
            className="h-11 w-full min-w-0 rounded-[10px] border border-rule-surface bg-field px-3 text-sm text-on-surface"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">Until (optional)</span>
          <input
            type="date"
            name="endsOn"
            className="h-11 w-full min-w-0 rounded-[10px] border border-rule-surface bg-field px-3 text-sm text-on-surface"
          />
        </label>
        <Button type="submit" variant="primary" className="h-11" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-5">
          <input type="checkbox" name="wholeWord" className="h-4 w-4" />
          Whole word only — otherwise &ldquo;ram&rdquo; also matches &ldquo;Rama&rdquo;
        </label>
      </form>

      {state.error ? (
        <p role="alert" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}
      {state.added ? (
        <p role="status" className="rounded-[10px] border border-brass/40 bg-brass/[0.08] px-3 py-2 text-sm">
          Added <strong>{state.added}</strong>.
        </p>
      ) : null}
    </div>
  );
}
