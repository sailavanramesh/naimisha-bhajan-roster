/**
 * lib/bhajanChoices.ts — the values a bhajan field already holds.
 *
 * "Correct this bhajan" was seven free-text boxes for fields that are really
 * closed vocabularies. Sailavan, 2026-08-21: "give dropdowns where they are
 * dropdown sections. Especially for Raga, Beat /taal, Tempo, Level, Language,
 * Gents pitch, Ladies pitch. and an option to document a new 'value' for those
 * dropdowns if necessary."
 *
 * The options are the values the masterlist ALREADY uses, not a list invented
 * here. That matters: the group's vocabulary is in its own data, and a hardcoded
 * list would be one more thing to keep in step with it. `beat` has five values
 * and `raga` has hundreds; both come from the same place.
 *
 * ONE round trip for all five, as a union — five `groupBy` calls would be five
 * full scans of the same table. Cached across requests under the same tag as the
 * masterlist read, so a raga typed in as a new value appears in the dropdown
 * afterwards: `updateBhajanFields` already calls `revalidateTag(BHAJANS_TAG)`.
 *
 * Pitch is deliberately NOT here. Gents and Ladies pitch are a genuinely closed
 * set of 24 labels in the PitchLabel table, which is where the ladder and the
 * shruti player already read them from — see `getPitchLabels`. Deriving them
 * from whatever the masterlist happens to contain would offer typos as choices.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { BHAJANS_TAG } from '@/lib/candidateQueries';

/** The fields the panel offers as a dropdown, in the order it shows them. */
export const CHOICE_FIELDS = ['raga', 'beat', 'tempo', 'level', 'language'] as const;

export type ChoiceField = (typeof CHOICE_FIELDS)[number];
export type BhajanChoices = Record<ChoiceField, string[]>;

export const getBhajanChoices = unstable_cache(
  async (): Promise<BhajanChoices> => {
    const rows = await prisma.$queryRaw<Array<{ field: string; value: string | null }>>`
      select 'raga'     as field, raga     as value from "Bhajan" group by 1, 2
      union all select 'beat',     beat     from "Bhajan" group by 1, 2
      union all select 'tempo',    tempo    from "Bhajan" group by 1, 2
      union all select 'level',    level    from "Bhajan" group by 1, 2
      union all select 'language', language from "Bhajan" group by 1, 2`;

    const out = Object.fromEntries(CHOICE_FIELDS.map((f) => [f, [] as string[]])) as BhajanChoices;
    for (const row of rows) {
      const field = row.field as ChoiceField;
      const value = (row.value ?? '').trim();
      // Blank is offered by the dropdown itself as "not recorded"; it is not a
      // value to pick from a list.
      if (!value || !(field in out)) continue;
      out[field].push(value);
    }
    for (const field of CHOICE_FIELDS) {
      out[field] = [...new Set(out[field])].sort((a, b) => a.localeCompare(b));
    }
    return out;
  },
  ['bhajan-choices'],
  { tags: [BHAJANS_TAG], revalidate: 3600 },
);

/** True when this field should be shown as a dropdown rather than a text box. */
export function isChoiceField(name: string): name is ChoiceField {
  return (CHOICE_FIELDS as readonly string[]).includes(name);
}
