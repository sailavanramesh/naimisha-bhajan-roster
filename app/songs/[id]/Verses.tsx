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
 * The section heading — Pallavi, Charanam 2, Chorus.
 *
 * Tinted by family so a Carnatic kriti and a Western-structured song are
 * distinguishable at a glance, and left plain when the group has written its
 * own label. An unrecognised heading is not a mistake to be highlighted; it is
 * just a heading the app has no opinion about.
 */
function SectionHeading({ label }: { label: string }) {
  const family = sectionFamily(label);
  const tint =
    family === "carnatic"
      ? "border-brass/50 bg-brass/[0.12] text-brass-ink"
      : family === "western"
        ? "border-rule-surface bg-field text-on-surface"
        : "border-dashed border-rule-surface text-on-surface-muted";

  return (
    <span
      className={`justify-self-start rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tint}`}
    >
      {label}
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
