"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { EDITABLE_FIELDS, describeEdit } from "@/lib/bhajanFields";
import { updateBhajanFields, revertBhajanField } from "./editActions";

export type FieldEdit = { field: string; sourceValue: string | null; editedBy: string | null };

/**
 * Correcting the masterlist, in place.
 *
 * Collapsed. The masterlist is right far more often than it is wrong, so this
 * is a rare act on a page people mostly open to read the words — it should not
 * push the lyrics down the screen for everyone.
 *
 * An edited field is marked with a small dot rather than a banner. Sailavan:
 * "show which field has been edited, very discretely." The dot's tooltip
 * carries what the masterlist said, which is the useful part, and every edited
 * field can be put straight back to it.
 */
export function EditBhajanPanel({
  bhajanId,
  values,
  edits,
}: {
  bhajanId: string;
  values: Record<string, string | null>;
  edits: FieldEdit[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.name, values[f.name] ?? ""])),
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const editedBy = new Map(edits.map((e) => [e.field, e]));

  const save = () =>
    startTransition(async () => {
      setResult(null);
      const res = await updateBhajanFields({ bhajanId, patch: draft });
      if (!res.ok) {
        setResult({ ok: false, text: res.error });
        return;
      }
      setResult({
        ok: true,
        text:
          res.changed.length === 0
            ? "Nothing had changed."
            : `Saved: ${res.changed.join(", ")}.`,
      });
      router.refresh();
    });

  const revert = (field: string) =>
    startTransition(async () => {
      const res = await revertBhajanField({ bhajanId, field });
      if (!res.ok) {
        setResult({ ok: false, text: res.error });
        return;
      }
      const source = editedBy.get(field)?.sourceValue ?? "";
      setDraft((d) => ({ ...d, [field]: source }));
      setResult({ ok: true, text: "Put back to the masterlist value." });
      router.refresh();
    });

  return (
    <details className="rounded-[12px] border border-rule-surface bg-panel">
      <summary className="flex cursor-pointer select-none items-baseline justify-between gap-3 px-4 py-3 text-sm font-semibold">
        <span>Correct this bhajan</span>
        <span className="text-xs font-normal text-on-surface-muted">
          {edits.length === 0
            ? "as imported"
            : `${edits.length} field${edits.length === 1 ? "" : "s"} changed`}
        </span>
      </summary>

      <div className="grid gap-3 px-4 pb-4">
        <p className="text-xs text-on-surface-muted">
          Changes are the group&rsquo;s own and win everywhere in the app. What the masterlist
          said is kept, so anything here can be put back.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {EDITABLE_FIELDS.map((f) => {
            const edit = editedBy.get(f.name);
            return (
              <label
                key={f.name}
                className={f.kind === "block" ? "grid gap-1 sm:col-span-2" : "grid gap-1"}
              >
                <span className="flex items-baseline gap-1.5 text-[11px] text-on-surface-muted">
                  {f.label}
                  {edit ? (
                    <>
                      {/* The whole marker: a dot, and what it replaced in the
                          tooltip. Anything louder would sit on a page whose job
                          is to show the words. */}
                      <span
                        aria-hidden
                        title={describeEdit(f.name, edit.sourceValue)}
                        className="text-brass"
                      >
                        ●
                      </span>
                      <span className="sr-only">
                        {describeEdit(f.name, edit.sourceValue)}
                      </span>
                      <button
                        type="button"
                        onClick={() => revert(f.name)}
                        disabled={pending}
                        className="underline underline-offset-2 hover:text-on-surface"
                      >
                        undo
                      </button>
                    </>
                  ) : null}
                </span>

                {f.kind === "block" ? (
                  <textarea
                    rows={4}
                    value={draft[f.name] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                    className="w-full rounded-[10px] border border-rule-surface bg-field px-2 py-1.5 text-sm text-on-surface"
                  />
                ) : (
                  <input
                    type="text"
                    value={draft[f.name] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                    className="h-9 w-full rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
                  />
                )}

                {f.hint ? <span className="text-[10px] text-on-surface-muted">{f.hint}</span> : null}
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" className="h-9" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {result ? (
            <span
              role="status"
              className={result.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}
            >
              {result.text}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}

/**
 * The dot as it appears next to a value elsewhere on the page.
 *
 * Same marker, same tooltip, so "this is not what the masterlist said" reads
 * identically wherever it turns up.
 */
export function EditedDot({ field, sourceValue }: { field: string; sourceValue: string | null }) {
  return (
    <span
      title={describeEdit(field, sourceValue)}
      className="ms-1 align-super text-[9px] leading-none text-brass"
    >
      ●<span className="sr-only"> {describeEdit(field, sourceValue)}</span>
    </span>
  );
}
