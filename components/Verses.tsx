"use client";

import { useState } from "react";
import { sectionFamily, verseLayout } from "@/lib/songVerses";

export type VerseView = {
  id: string;
  label: string | null;
  script: string | null;
  roman: string | null;
  meaning: string | null;
};

type Layer = "script" | "roman" | "meaning";

const LAYER_LABEL: Record<Layer, string> = {
  script: "Script",
  roman: "Transliteration",
  meaning: "Meaning",
};

/**
 * The words of a song.
 *
 * Three layers, each switchable, because three different people read this page
 * for three different reasons: somebody who reads Tamil wants the Tamil, a
 * singer wants the transliteration they will actually sing from, and somebody
 * preparing a talk wants the meaning. Showing all three at once by default and
 * letting each person turn off what they do not need beats guessing.
 *
 * Line-by-line WHEN THE LAYERS LINE UP, blocks when they do not — see
 * lib/songVerses.ts. The Janmashtami document writes a meaning against every
 * line; the Meerabai one writes a stanza and then one English block. Forcing
 * either into the other's shape would misattribute somebody's translation.
 */
export function Verses({ verses }: { verses: VerseView[] }) {
  const present: Layer[] = (["script", "roman", "meaning"] as Layer[]).filter((layer) =>
    verses.some((v) => (v[layer] ?? "").trim().length > 0),
  );
  const [shown, setShown] = useState<Set<Layer>>(new Set(present));

  if (verses.length === 0) {
    return <p className="text-sm text-on-surface-muted">No words recorded yet.</p>;
  }

  const visible = (layer: Layer) => shown.has(layer) && present.includes(layer);

  return (
    <div className="grid gap-4">
      {present.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {present.map((layer) => (
            <button
              key={layer}
              type="button"
              aria-pressed={shown.has(layer)}
              onClick={() =>
                setShown((prev) => {
                  const next = new Set(prev);
                  // Never turn the last one off: a page with no words on it is
                  // not a state anybody is asking for.
                  if (next.has(layer) && next.size > 1) next.delete(layer);
                  else next.add(layer);
                  return next;
                })
              }
              className={`rounded-full border px-3 py-1 text-xs ${
                shown.has(layer)
                  ? "border-brass/60 bg-field text-on-surface"
                  : "border-rule-surface text-on-surface-muted hover:text-on-surface"
              }`}
            >
              {LAYER_LABEL[layer]}
            </button>
          ))}
        </div>
      ) : null}

      <ol className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {verses.map((verse) => (
          <li key={verse.id} className="grid min-w-0 gap-1.5">
            {verse.label ? <SectionHeading label={verse.label} /> : null}
            <VerseBody verse={verse} visible={visible} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The section heading — Pallavi, Charanam 2, Chorus, Madhyama Kaalam.
 *
 * ONE LOOK FOR ALL OF THEM.
 *
 * There were three: brass for a Carnatic name, grey for a Western one, and a
 * faint dashed outline for anything the app did not recognise. The reasoning was
 * that the family should be legible at a glance — but the family is already
 * legible, because it is written in the chip: nobody mistakes "Chorus" for a
 * kriti section. What the three tints actually did was rank the group's own
 * headings below the app's vocabulary. Sailavan wrote "Madhyama Kaalam" and
 * "Caranam" and they came out looking provisional beside PALLAVI, which is
 * backwards — the group's words for its own music are not a lesser kind of
 * heading.
 *
 * So every heading gets the same chip, and a name the app does not know carries
 * a small dot. Sailavan: "if it's a custom one then there can be a small marker
 * but it should look largely the same." The dot is worth keeping because it says
 * why a heading will not auto-number — "Caranam" is not "Charanam", so nothing
 * counts it — and that is a real difference rather than a judgement.
 */
function SectionHeading({ label }: { label: string }) {
  const own = sectionFamily(label) === null;

  return (
    <span
      title={own ? "The group's own heading" : label}
      className="flex items-center gap-1 justify-self-start rounded-full border border-brass/50 bg-brass/[0.12] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brass-ink"
    >
      {own ? (
        <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-brass-ink/60" />
      ) : null}
      {label}
      {own ? <span className="sr-only"> (the group&rsquo;s own heading)</span> : null}
    </span>
  );
}

/**
 * One verse: the layers that line up, zipped, and the rest beneath.
 *
 * Both parts can appear at once, which is the Krishna document's shape — six
 * lines of Devanagari paired with six of transliteration, and then one English
 * sentence for the whole verse. See lib/songVerses.ts `verseLayout`.
 */
function VerseBody({
  verse,
  visible,
}: {
  verse: VerseView;
  visible: (layer: Layer) => boolean;
}) {
  const { lines, blocks } = verseLayout(verse);

  const blockStyle: Record<Layer, string> = {
    script: "whitespace-pre-wrap font-display text-lg leading-relaxed text-on-surface",
    roman: "whitespace-pre-wrap text-[15px] leading-relaxed text-on-surface",
    meaning:
      "whitespace-pre-wrap border-l-2 border-rule-surface pl-3 text-sm italic leading-relaxed text-on-surface-muted",
  };

  return (
    <div className="grid gap-2">
      {lines.length > 0 ? (
        <div className="grid gap-2">
          {lines.map((line, i) => (
            <div key={i} className="grid gap-0.5">
              {visible("script") && line.script ? (
                <p className="font-display text-lg leading-snug text-on-surface">{line.script}</p>
              ) : null}
              {visible("roman") && line.roman ? (
                <p className="text-[15px] leading-snug text-on-surface">{line.roman}</p>
              ) : null}
              {visible("meaning") && line.meaning ? (
                <p className="text-sm italic leading-snug text-on-surface-muted">{line.meaning}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {blocks
        .filter((block) => visible(block.layer))
        .map((block) => (
          <p key={block.layer} className={blockStyle[block.layer]}>
            {block.text}
          </p>
        ))}
    </div>
  );
}
