"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDefaultRosterView } from "./viewActions";

/**
 * "Make this my default."
 *
 * Only shown when the view you are looking at is not already your default, so
 * on the ordinary visit there is nothing here at all. Switching view on its
 * own must not change the default — otherwise glancing at the other one costs
 * you your preference — so this is a separate, deliberate click.
 */
export function DefaultViewToggle({
  view,
  isDefault,
}: {
  view: "calendar" | "list";
  isDefault: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(isDefault);
  const [error, setError] = useState<string | null>(null);

  if (saved) {
    return <span className="text-[11px] text-on-surface-muted">your default</span>;
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setDefaultRosterView(view);
            if (res.ok) {
              setSaved(true);
              setError(null);
              router.refresh();
            } else {
              setError(res.error);
            }
          })
        }
        className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
      >
        {pending ? "Saving…" : "Make this my default"}
      </button>
      {error ? <span className="text-[11px] text-warn">{error}</span> : null}
    </span>
  );
}
