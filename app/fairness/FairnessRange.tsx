"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { filtersToQuery, type FairnessFilters } from "@/lib/fairnessFilters";

/**
 * An exact date range, beside the presets.
 *
 * Collapsed to a link, because the presets answer it nine times out of ten and
 * two date boxes permanently on show would be two boxes most people never
 * touch. It is here for the tenth time — "how did the load look over the
 * festival fortnight" — which the presets cannot express at all.
 */
export function FairnessRange({ filters }: { filters: FairnessFilters }) {
  const router = useRouter();
  const [open, setOpen] = useState(filters.presetDays === null);
  const [from, setFrom] = useState(filters.fromISO);
  const [to, setTo] = useState(filters.toISO);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
      >
        Exact dates
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        aria-label="From"
        className="h-8 rounded-[10px] border border-rule-surface bg-field px-2 text-xs text-on-surface"
      />
      <span className="text-xs text-on-surface-muted">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        aria-label="To"
        className="h-8 rounded-[10px] border border-rule-surface bg-field px-2 text-xs text-on-surface"
      />
      <Button
        type="button"
        className="h-8 text-xs"
        onClick={() =>
          router.push(`/fairness${filtersToQuery(filters, { from, to, days: null })}`)
        }
      >
        Go
      </Button>
      {filters.presetDays === null ? (
        <button
          type="button"
          onClick={() => router.push(`/fairness${filtersToQuery(filters, { days: 365, from: null, to: null })}`)}
          className="text-xs text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
        >
          clear
        </button>
      ) : null}
    </span>
  );
}
