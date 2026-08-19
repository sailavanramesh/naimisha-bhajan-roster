"use client";

import { useMemo } from "react";
import { SHORTLIST_ZONES, allTimeZones, canonicalZone, zoneLabel } from "@/lib/timezones";

/**
 * Which city's clock a session's time is on.
 *
 * Sailavan, 2026-08-19: "a shortlist at the top, and the rest of the cities only
 * if asked for". So the three the centre actually uses sit in their own group
 * where they can be hit without thinking, and the four hundred others are in a
 * second group below — present, because a session could be anywhere, but never
 * in the way of the answer that is right almost every time.
 *
 * Chennai, Tiruvannamalai and Hyderabad share one option because they share one
 * clock. All three names are on it so that somebody scanning for their own city
 * still finds it; splitting them into three options that saved the same value
 * would mean two of them came back looking like the third.
 */
export function TimeZoneSelect({
  value,
  onChange,
  disabled,
  id,
  className,
}: {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const others = useMemo(() => allTimeZones().slice(SHORTLIST_ZONES.length), []);

  /*
   * A saved zone that is not one of the options — because it was written under
   * the other spelling of a renamed zone, or because the option list from this
   * runtime's ICU is a little different from the one that saved it — gets its
   * own entry rather than silently showing as whatever `<select>` falls back
   * to. Being shown the wrong city is worse than being shown an odd one.
   */
  const known = useMemo(() => {
    const canon = new Set(
      [...SHORTLIST_ZONES.map((z) => z.zone), ...others].map(canonicalZone),
    );
    return canon.has(canonicalZone(value));
  }, [others, value]);

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
      }
    >
      {known ? null : <option value={value}>{zoneLabel(value)}</option>}
      <optgroup label="Usual">
        {SHORTLIST_ZONES.map((z) => (
          <option key={z.zone} value={z.zone}>
            {z.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Everywhere else">
        {others.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
