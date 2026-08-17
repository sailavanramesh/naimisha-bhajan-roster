"use client";

import { stripNumber } from "@/lib/deskChannels";
import { micColourDot, micColourLabel, type MicColourValue } from "@/lib/micCushion";

/**
 * The desk, drawn.
 *
 * ONE picture of the mixer, used twice: editable on the programme page, where
 * tapping a strip says who is on it, and read-only on the night, where the open
 * ones light up. Sailavan asked whether assigning against a mock-up of the
 * mixer would be more intuitive than a grid of tick boxes, and it is — the
 * screen and the hardware then have the same shape, and a sound person reads
 * the screen the way they read the desk.
 *
 * DRAWN, not photographed. A picture of an MG20XU would be the tacky version
 * and the fragile one: it needs a licensed image, hotspots over a photo do not
 * reflow onto a phone, and it becomes a picture of the wrong desk the day the
 * SQ5 arrives. Strips drawn from the data are none of those things, and they
 * already carry the two facts that matter — the number printed on the fader and
 * the colour of the cushion on that mic.
 *
 * The items × channels grid stays where it is. That one genuinely is a matrix —
 * every item against every channel — and a matrix is what a grid is for.
 */

export type Strip = {
  id: string;
  number: string;
  label: string;
  kind: string;
  colour: MicColourValue | null;
  mic: string | null;
  stereo: boolean;
  /** Who or what is on it. Already resolved, overrides and all. */
  who: string | null;
};

/**
 * What to write on a strip: whoever is on it, else its own label — but never a
 * bare "Channel 12", which is the number already printed above it.
 */
export function stripName(who: string | null, label: string): string | null {
  if (who) return who;
  return /^channel\s*\d+(\/\d+)?$/i.test(label.trim()) ? null : label;
}

export function DeskStrips({
  strips,
  /** Open channels, when the strips are showing one moment of a programme. */
  openIds,
  /** Marked as changed for this item — a mic that has swapped hands. */
  swappedIds,
  onPick,
  dense = false,
}: {
  strips: Strip[];
  openIds?: ReadonlySet<string>;
  swappedIds?: ReadonlySet<string>;
  onPick?: (id: string) => void;
  dense?: boolean;
}) {
  const live = openIds !== undefined;

  return (
    <ul
      className={`grid gap-1.5 ${
        dense
          ? "grid-cols-[repeat(auto-fill,minmax(76px,1fr))]"
          : "grid-cols-[repeat(auto-fill,minmax(84px,1fr))]"
      }`}
    >
      {strips.map((s) => {
        const open = live ? openIds!.has(s.id) : true;
        const swapped = swappedIds?.has(s.id) ?? false;
        // A cushion belongs to a mic, so only a vocal strip has one.
        const cushion = s.kind === "vocal" && s.colour ? micColourDot(s.colour) : null;
        const name = stripName(s.who, s.label);

        const title = [
          `Channel ${stripNumber(s.number, s.stereo)}`,
          s.stereo ? "stereo pair" : null,
          name,
          s.kind === "vocal" && s.colour ? `${micColourLabel(s.colour)} cushion` : null,
          s.mic,
          swapped ? "for this item only" : null,
          live ? (open ? "open" : "closed") : null,
        ]
          .filter(Boolean)
          .join(" · ");

        const body = (
          <>
            {/* The number as the desk prints it, always legible: it is how the
                fader is labelled and how the strip is named out loud. */}
            <span
              aria-hidden
              className={`block border-b px-1 py-0.5 text-center font-mono text-[11px] font-bold leading-none ${
                open
                  ? "border-on-ground/20 bg-surface/60 text-on-ground"
                  : "border-rule text-on-ground-muted"
              }`}
            >
              {stripNumber(s.number, s.stereo)}
            </span>

            <span
              aria-hidden
              /*
                The brass wash means OPEN, so it only appears where "open" is a
                thing. Assigning a desk has no open and closed — every strip
                exists equally — and washing them all read as every fader being
                up, which is the one thing the colour is for saying.
              */
              className={`flex min-h-[38px] flex-1 flex-col items-center justify-center px-0.5 py-1 text-center ${
                cushion ? "" : live && open ? "bg-brass/25" : ""
              }`}
              style={
                cushion
                  ? {
                      // Full colour when the fader is up, a wash of it when it
                      // is down — a closed strip still says which cushion it is
                      // without competing for attention.
                      background: open ? cushion : `${cushion}33`,
                      color: open ? "#fff" : undefined,
                    }
                  : undefined
              }
            >
              <span className="block w-full truncate text-[12px] font-bold leading-tight">
                {name ?? "—"}
              </span>
              {s.mic ? (
                <span className="mt-0.5 block w-full truncate text-[9px] leading-none opacity-80">
                  {s.mic}
                </span>
              ) : null}
            </span>

            {/* Colour is never the only carrier: a dark hall and a colour-blind
                operator are both ordinary. */}
            <span className="sr-only">{title}</span>
          </>
        );

        const shell = [
          "flex h-full w-full flex-col items-stretch overflow-hidden rounded-[8px] border text-left",
          open ? "border-on-ground/25" : "border-rule opacity-40 grayscale",
          swapped ? "ring-1 ring-brass/70" : "",
        ].join(" ");

        return (
          <li
            key={s.id}
            /*
             * A stereo strip is ONE fader carrying two inputs, and it is wider
             * on the desk — so it is wider here. The pair number alone would
             * say it, but only to somebody already reading closely.
             */
            className={s.stereo ? "col-span-2" : undefined}
          >
            {onPick ? (
              <button type="button" title={title} className={shell} onClick={() => onPick(s.id)}>
                {body}
              </button>
            ) : (
              <span title={title} className={shell}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
