/**
 * The matching part of a string, marked.
 *
 * A tinted background rather than the browser's default yellow <mark>, which on
 * these pages reads as a warning.
 *
 * Lived in components/SessionRows.tsx until 2026-08-21, when the bhajan search
 * needed it too. Nothing about it was ever specific to a session row.
 */

import { splitOnMatch } from "@/lib/highlight";

export function Marked({ text, query }: { text: string; query?: string | null }) {
  const pieces = splitOnMatch(text, query);
  if (pieces.length === 1 && !pieces[0].hit) return <>{text}</>;
  return (
    <>
      {pieces.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-[3px] bg-brass/25 px-0.5 text-on-surface">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
