"use client";

import { useState } from "react";

/**
 * A date input that looks empty when it is empty.
 *
 * iOS Safari draws an unset `<input type="date">` showing TODAY, in the same
 * weight as a real value — so a filter nobody has touched reads as "from 12
 * Aug to 12 Aug", which is both wrong and the opposite of what it does.
 * Desktop browsers show a grey dd/mm/yyyy and are clear about it.
 *
 * CSS cannot ask whether a date input has a value, so this tracks it and
 * stamps `data-empty`, which app/globals.css fades. It stays an ordinary
 * uncontrolled field otherwise: the form posts it by name exactly as before.
 */
export function DateField({
  name,
  defaultValue = "",
  label,
  className = "",
}: {
  name: string;
  defaultValue?: string;
  label: string;
  className?: string;
}) {
  const [empty, setEmpty] = useState(defaultValue.trim().length === 0);

  return (
    <input
      type="date"
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      data-empty={empty ? "true" : undefined}
      onChange={(e) => setEmpty(e.target.value.trim().length === 0)}
      /* min-w-0 is what keeps it inside its grid track: a date input carries
         an intrinsic minimum width and will otherwise push out of the card. */
      className={`h-11 w-full min-w-0 rounded-[10px] border border-rule-surface bg-field px-3 text-sm text-on-surface ${className}`}
    />
  );
}
