"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeSinger } from "./actions";

/**
 * Two-step remove: the first click arms it, the second does it.
 *
 * Calls the action directly rather than through a <form>. Each Access row is
 * ALREADY a form — the one that saves the address and role — and a form inside
 * a form is invalid HTML: the browser silently drops the inner one, so the
 * confirm button submitted the row's save action instead and nothing appeared
 * to happen. Nothing in the markup says so; only clicking it does.
 *
 * A confirm step rather than a dialog because the action is narrow — the server
 * refuses anybody with history — so the risk is a mis-click on a tester, not
 * data loss.
 */
export function RemovePersonButton({ singerId, name }: { singerId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = () =>
    startTransition(async () => {
      const res = await removeSinger(singerId);
      if (res.error) {
        setError(res.error);
        setArmed(false);
      } else {
        setError(null);
        router.refresh();
      }
    });

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {armed ? (
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="h-8 rounded-[10px] border border-warn/60 bg-warn/[0.10] px-2 text-xs font-semibold"
          >
            {pending ? "removing…" : `Remove ${name}`}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="h-8 rounded-[10px] border border-rule-surface px-2 text-xs text-on-surface-muted"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          title={`Remove ${name} from the list entirely`}
          className="h-8 rounded-[10px] border border-rule-surface px-2 text-xs text-on-surface-muted hover:border-warn/50 hover:text-on-surface"
        >
          Remove
        </button>
      )}

      {error ? (
        <span role="alert" className="max-w-[22rem] text-right text-[11px] leading-snug text-warn">
          {error}
        </span>
      ) : null}
    </span>
  );
}
