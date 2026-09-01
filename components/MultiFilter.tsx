"use client";

import { useMemo, useState } from "react";
import { toggleValue, type FilterMode } from "@/lib/learningListFilter";

/**
 * components/MultiFilter.tsx — a set of chips that behaves like checkboxes,
 * read either way round.
 *
 * The same shape as the kind filter on /fairness, which Sailavan asked this to
 * match: Only/Except is one control for the WHOLE row rather than a third state
 * on each chip, because "everything but a festival" is one question about the
 * row and three-state chips would make you work out which of six pills was in
 * which state to answer it.
 *
 * One thing fairness does not have to deal with: a hundred and forty bhajans
 * touch far more ragas than the centre has kinds of session. Past `CHIP_LIMIT`
 * the chips become a search box over a scrolling list, because forty chips is
 * not a filter, it is a wall. The chosen ones stay pinned at the top either way,
 * so what is currently set is always visible without scrolling to find it.
 */

/** Above this many options, chips give way to a searchable list. */
const CHIP_LIMIT = 10;

export function MultiFilter({
  label,
  options,
  selected,
  mode,
  onChange,
  onModeChange,
}: {
  label: string;
  options: readonly string[];
  selected: readonly string[];
  /** Omitted for a filter where "except" would say nothing new. */
  mode?: FilterMode;
  onChange: (values: string[]) => void;
  onModeChange?: (mode: FilterMode) => void;
}) {
  const [query, setQuery] = useState("");
  const asList = options.length > CHIP_LIMIT;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rest = options.filter((o) => !selected.includes(o));
    const matching = q ? rest.filter((o) => o.toLowerCase().includes(q)) : rest;
    // What is set stays at the top, always, and is never filtered out from
    // under you by the search box.
    return [...selected.filter((s) => options.includes(s)), ...matching];
  }, [options, selected, query]);

  const chip = (value: string) => {
    const on = selected.includes(value);
    return (
      <button
        key={value}
        type="button"
        onClick={() => onChange(toggleValue(selected, value))}
        aria-pressed={on}
        className={[
          "rounded-full border px-2.5 py-0.5 text-xs",
          on
            ? "border-brass/60 bg-brass/15 text-on-surface"
            : "border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
        ].join(" ")}
      >
        {on ? "✓ " : ""}
        {value}
      </button>
    );
  };

  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-on-surface-muted">{label}</span>

        {mode && onModeChange ? (
          <span className="inline-flex overflow-hidden rounded-full border border-rule-surface text-[11px]">
            {(["include", "exclude"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                aria-pressed={mode === m}
                className={
                  mode === m
                    ? "bg-brass/15 px-2 py-0.5 text-on-surface"
                    : "px-2 py-0.5 text-on-surface-muted hover:bg-panel-hover"
                }
              >
                {m === "include" ? "Only" : "Except"}
              </button>
            ))}
          </span>
        ) : null}

        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="ms-auto text-[11px] text-brass-ink underline underline-offset-2"
          >
            Any
          </button>
        ) : null}
      </div>

      {asList ? (
        <div className="grid min-w-0 gap-1.5 rounded-[10px] border border-rule-surface bg-field p-1.5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find a ${label.toLowerCase()}…`}
            aria-label={`Find a ${label.toLowerCase()}`}
            className="h-8 w-full min-w-0 rounded-[8px] border border-rule-surface bg-panel px-2 text-xs"
          />
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {shown.length === 0 ? (
              <span className="px-1 py-0.5 text-[11px] text-on-surface-muted">
                Nothing matching.
              </span>
            ) : (
              shown.map(chip)
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">{options.map(chip)}</div>
      )}
    </div>
  );
}
