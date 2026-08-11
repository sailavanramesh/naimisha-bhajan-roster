"use client";

import { useActionState } from "react";
import { Input, Button } from "@/components/ui";
import { addSinger, type AddSingerState } from "./actions";

/**
 * Add somebody to the allowlist.
 *
 * A client form so the outcome can be SHOWN. The server action returns its
 * result rather than throwing, because a throw from a Server Action reaches
 * production as "An error occurred in the Server Components render" with the
 * message stripped — and the two failures here, a duplicate name and an
 * address already used by somebody else, are exactly the mistakes a
 * coordinator will make and needs told about by name.
 */
export function AddPersonForm() {
  const [state, formAction, pending] = useActionState<AddSingerState, FormData>(addSinger, {});

  return (
    <div className="grid gap-2">
      <form
        action={formAction}
        // Clearing after a success is what makes adding several people in a
        // row work; otherwise the last name sits in the box looking unsaved.
        key={state.added ?? "empty"}
        className="grid items-end gap-2 rounded-[12px] border border-brass/35 bg-brass/[0.05] p-3 sm:grid-cols-[10rem_1fr_7rem_9rem_auto]"
      >
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">Name</span>
          <Input name="name" required placeholder="Their name" aria-label="Name" />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">Google address</span>
          <Input name="email" type="email" placeholder="name@gmail.com" aria-label="Google address" />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">Voice</span>
          <select
            name="gender"
            defaultValue=""
            className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
            aria-label="Voice"
          >
            <option value="">Not recorded</option>
            <option value="Gents">Gents</option>
            <option value="Ladies">Ladies</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-on-surface-muted">Access</span>
          <select
            name="role"
            defaultValue="singer"
            className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
            aria-label="Access level"
          >
            <option value="singer">Member</option>
            <option value="coordinator">Editor</option>
          </select>
        </label>
        <Button type="submit" variant="primary" className="h-11" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </Button>
        <p className="text-xs text-on-surface-muted sm:col-span-5">
          Leave the address blank for somebody who sings but does not need to sign in.{" "}
          <strong>Leave the voice unrecorded for somebody who is not a singer</strong> — they
          can sign in and read the roster, but cannot be put on a session, because the
          recommended pitch is defined per voice.
        </p>
      </form>

      {state.error ? (
        <p role="alert" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}
      {state.added ? (
        <p role="status" className="rounded-[10px] border border-brass/40 bg-brass/[0.08] px-3 py-2 text-sm">
          Added <strong>{state.added}</strong>. They can sign in as soon as their Google
          address is on their row.
        </p>
      ) : null}
    </div>
  );
}
