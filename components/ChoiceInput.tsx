"use client";

import { useState } from "react";

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
export function ChoiceField({
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
            // Named so a native form submits what was typed. Harmless where the
            // parent keeps the value in state instead.
            name={name}
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
 * The same control for a plain HTML form, holding its own value.
 *
 * "Correct this bhajan" keeps its values in React state because it saves them
 * through a Server Action as one patch. Add-a-bhajan is a native
 * `<form action={createBhajan}>` and reads FormData, so the value has to be
 * carried by a NAMED field — a hidden one while the list is in charge, the real
 * text box once somebody is typing a new value. Same behaviour, same words, one
 * implementation.
 *
 * Sailavan, 2026-08-21: "the dropdowns should exist in Add a bhajan too, its the
 * same concept with the same escape hatch for new values."
 */
export function ChoiceFormField({
  name,
  options,
  defaultValue = "",
  className,
}: {
  name: string;
  options: readonly string[];
  defaultValue?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [typing, setTyping] = useState(false);
  const unlisted = value !== "" && !options.includes(value);

  return (
    <span className={className}>
      {/* The list is a control, not the field: the value is always carried by
          the named input below, so both modes submit the same way. */}
      <ChoiceField
        name={name}
        value={value}
        options={options}
        typing={typing}
        onValue={setValue}
        onTyping={setTyping}
      />
      {!(typing || unlisted) ? <input type="hidden" name={name} value={value} /> : null}
    </span>
  );
}
