/**
 * lib/bhajanFields.ts — which bhajan fields the group may correct.
 *
 * Pure. No Prisma import.
 *
 * A whitelist rather than "anything on the model", because a Server Action
 * that takes a field name from the browser and puts it in an update is a
 * write-anything hole — `id`, `origin` and the join-table columns are not the
 * group's to edit through this door.
 *
 * `deity` is deliberately absent even though it is a real column. It is
 * denormalised into join tables at seed time and every filter queries those,
 * so editing the raw string would leave the two disagreeing and quietly break
 * "show me Ganesha bhajans". Correcting a deity needs the join rows rewritten
 * too, and that is a bigger change than this one.
 */

/**
 * How a field is edited.
 *
 * `choice` is a dropdown of the values the masterlist already holds, plus a way
 * to type one it does not — see lib/bhajanChoices.ts for where the options come
 * from, and note that pitch takes its options from the PitchLabel table
 * instead, being a genuinely closed set.
 */
export type BhajanFieldKind = "line" | "block" | "choice";

export type EditableField = {
  /** The Prisma field name. */
  name: string;
  /** As written on screen. */
  label: string;
  kind: BhajanFieldKind;
  /** Shown under the input when there is something worth saying. */
  hint?: string;
};

export const EDITABLE_FIELDS: readonly EditableField[] = [
  { name: "title", label: "Title", kind: "line", hint: "Must stay unique across the masterlist." },
  { name: "raga", label: "Raga", kind: "choice", hint: "Dual names as \"Kalyani / Yaman\"." },
  { name: "beat", label: "Beat / taal", kind: "choice" },
  { name: "tempo", label: "Tempo", kind: "choice" },
  { name: "level", label: "Level", kind: "choice" },
  {
    name: "language",
    label: "Language",
    kind: "choice",
    hint: "A bhajan in several is one value, comma-joined.",
  },
  {
    name: "composer",
    label: "Composer",
    kind: "line",
    hint: "Blank everywhere to start with — the masterlist never carried it.",
  },
  {
    name: "referenceGentsPitch",
    label: "Gents pitch",
    kind: "choice",
    hint: "The note after the slash is the drone, not always the Sa.",
  },
  { name: "referenceLadiesPitch", label: "Ladies pitch", kind: "choice" },
  { name: "notesRange", label: "Range", kind: "line" },
  { name: "songTags", label: "Tags", kind: "line" },
  { name: "singers", label: "Sung by", kind: "line" },
  { name: "lyrics", label: "Lyrics", kind: "block" },
  { name: "meaning", label: "Meaning", kind: "block" },
  { name: "musicNotesForFirstLine", label: "Notation, first line", kind: "block" },
  { name: "generalComments", label: "Comments", kind: "block" },
  { name: "glossaryTerms", label: "Glossary", kind: "block" },
  { name: "url", label: "Sai Rhythms page", kind: "line" },
  { name: "audio", label: "Audio", kind: "line" },
  { name: "video", label: "Video", kind: "line" },
  { name: "tutorial", label: "Tutorial", kind: "line" },
  { name: "sheetMusic", label: "Sheet music", kind: "line" },
  { name: "karaokeTracksForPractice", label: "Karaoke", kind: "line" },
] as const;

const BY_NAME = new Map(EDITABLE_FIELDS.map((f) => [f.name, f]));

export function isEditableField(name: string): boolean {
  return BY_NAME.has(name);
}

export function fieldLabel(name: string): string {
  return BY_NAME.get(name)?.label ?? name;
}

/**
 * Trim, and treat an empty string as "not recorded".
 *
 * The masterlist's missing values are nulls, and a filter that offers a
 * distinct "unspecified" state has to keep seeing nulls — an empty string
 * would be a third thing meaning the same as one of them.
 */
export function cleanFieldValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Did the group actually change anything? Null and "" are the same value. */
export function hasChanged(before: string | null, after: string | null): boolean {
  return (before ?? "") !== (after ?? "");
}

/**
 * How an edited field is described in one short line.
 *
 * Named here so the page, the tooltip and any future export say it the same
 * way, and so it can be tested without a browser.
 */
export function describeEdit(field: string, sourceValue: string | null): string {
  const label = fieldLabel(field);
  if (sourceValue === null) return `${label} — added by the group; the masterlist had none`;
  const shown = sourceValue.length > 80 ? `${sourceValue.slice(0, 77)}…` : sourceValue;
  return `${label} — the masterlist says: ${shown}`;
}
