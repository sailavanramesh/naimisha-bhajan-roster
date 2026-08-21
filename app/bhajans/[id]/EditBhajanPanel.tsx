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
  options,
}: {
  bhajanId: string;
  values: Record<string, string | null>;
  edits: FieldEdit[];
  /**
   * Choices per `kind: "choice"` field. The values the masterlist already holds
   * for raga, beat, tempo, level and language; the 24 real labels for the two
   * pitches. See lib/bhajanChoices.ts.
   */
  options: Record<string, readonly string[]>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.name, values[f.name] ?? ""])),
  );
  const [pending, startTransition] = useTransition();
  /*
   * Fields the person has explicitly chosen to type a new value into.
   *
   * Needed as its own bit of state because "typing something new" and "blank"
   * both leave the draft empty — without it, picking "Something else…" and then
   * clearing the box would snap the dropdown back to "not recorded" mid-edit.
   *
   * A value already stored that is NOT one of the options puts the field in the
   * same mode without anybody asking, which is how a one-off value the
   * masterlist arrived with stays visible and editable rather than being
   * silently replaced by the nearest match.
   */
  const [typing, setTyping] = useState<ReadonlySet<string>>(new Set());
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
                ) : f.kind === "choice" ? (
                  <ChoiceField
                    name={f.name}
                    value={draft[f.name] ?? ""}
                    options={options[f.name] ?? []}
                    typing={typing.has(f.name)}
                    onValue={(v) => setDraft((d) => ({ ...d, [f.name]: v }))}
                    onTyping={(on) =>
                      setTyping((s) => {
                        const next = new Set(s);
                        if (on) next.add(f.name);
                        else next.delete(f.name);
                        return next;
                      })
                    }
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

/** The sentinel the dropdown uses for "not one of these". Never stored. */
const SOMETHING_ELSE = "\u0000new";

/**
 * A field whose value is normally one of a known set.
 *
 * A dropdown of what the masterlist already uses, plus a last entry that turns
 * the control into a text box. Sailavan asked for both halves: "give dropdowns
 * where they are dropdown sections … and an option to document a new 'value'
 * for those dropdowns if necessary."
 *
 * A native <select> rather than an input with a datalist. A datalist would do
 * both jobs in one control, but on a phone it reads as a text box with a
 * suggestion strip — and "dropdown" is what was asked for, on a phone, where
 * the native picker is the best control the platform has. The escape hatch is
 * explicit instead, which also means the app can say plainly that a new value
 * is being added rather than leaving somebody to wonder whether a typo took.
 */
function ChoiceField({
  name,
  value,
  options,
  typing,
  onValue,
  onTyping,
}: {
  name: string;
  value: string;
  options: readonly string[];
  typing: boolean;
  onValue: (v: string) => void;
  onTyping: (on: boolean) => void;
}) {
  // A stored value that is not on the list is itself a reason to be in text
  // mode: it is a real value somebody recorded, and the dropdown cannot show it.
  const unlisted = value !== "" && !options.includes(value);
  const asText = typing || unlisted;

  return (
    <span className="grid gap-1">
      <select
        value={asText ? SOMETHING_ELSE : value}
        onChange={(e) => {
          if (e.target.value === SOMETHING_ELSE) {
            onTyping(true);
            // Deliberately keeps whatever is there, so picking "Something
            // else…" to adjust a value does not throw the value away first.
            return;
          }
          onTyping(false);
          onValue(e.target.value);
        }}
        className="h-9 w-full rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
      >
        <option value="">— not recorded —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={SOMETHING_ELSE}>Something else…</option>
      </select>

      {asText ? (
        <span className="grid gap-1">
          <input
            type="text"
            autoFocus={typing}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            placeholder={`A ${name === "raga" ? "raga" : "value"} the list does not have`}
            className="h-9 w-full rounded-[10px] border border-brass/50 bg-field px-2 text-sm text-on-surface"
          />
          <span className="flex items-baseline gap-2 text-[10px] text-on-surface-muted">
            {unlisted && !typing ? "Not one of the recorded values." : "Adding a new value."}
            <button
              type="button"
              onClick={() => {
                onTyping(false);
                // Back to the list means back to a value the list HAS. Leaving
                // the unlisted text behind would show a dropdown that disagreed
                // with what would be saved.
                if (unlisted) onValue("");
              }}
              className="underline underline-offset-2 hover:text-on-surface"
            >
              use the list instead
            </button>
          </span>
        </span>
      ) : null}
    </span>
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
