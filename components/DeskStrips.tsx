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
  return who ?? deskLabel(label);
}

/**
 * The desk's own name for a strip, or nothing when it does not say one.
 *
 * "Channel 12" is not a name — it is the number already printed above the tile,
 * and repeating it fills the line while saying nothing.
 */
export function deskLabel(label: string): string | null {
  return /^channel\s*\d+(\/\d+)?$/i.test(label.trim()) ? null : label;
}

export function DeskStrips({
  strips,
  /** Open channels, when the strips are showing one moment of a programme. */
  openIds,
  /**
   * Strips to ring. A mic that has swapped hands on a programme item; a
   * cushion two people are on, on the bhajan live desk. Two callers, two
   * meanings, so `flagLabel` says which one the tooltip should read.
   */
  swappedIds,
  /**
   * Strips carrying the LEAD, on a bhajan night.
   *
   * With a lead and two chorus singers, three strips light up in their cushion
   * colours and nothing says which of them is singing the bhajan — Sailavan,
   * 2026-08-18. So the lead's number bar fills and says the word.
   *
   * THE BRASS CHIP, the one the running order already uses for the bhajan the
   * room is on: a filled gold bar with the number in ivory. Sailavan asked for it
   * directly — "the same way the 1 gets a goldish circle and the text becomes
   * that light beige … when that bhajan is selected" — and he is right that it
   * belongs here. The chip does not mean a fourth thing; it means what it means
   * on the heading above, "the principal one here", said in the same voice one
   * level down — and a shade quieter, in `brass-soft`, so a strip never shouts
   * over the bhajan heading it sits under. See the token in globals.css for why
   * it stops where it does.
   *
   * Not colour alone, which this component forbids a few lines below: the chip
   * is a dark fill against a pale bar, so it survives a colour-blind reading on
   * contrast, and the title carries the word "lead" for a screen reader.
   *
   * Two earlier attempts, both Sailavan's calls: a solid black bar reading
   * "5 · lead" ("looks a bit weird … doesn't fit the mould" — the only pure
   * dark thing in a warm palette, and a mono number beside a sans word), then
   * the word on the line under the name.
   *
   * Empty on a programme, which has performers rather than a lead.
   */
  leadIds,
  flagLabel = "for this item only",
  onPick,
  dense = false,
}: {
  strips: Strip[];
  openIds?: ReadonlySet<string>;
  swappedIds?: ReadonlySet<string>;
  leadIds?: ReadonlySet<string>;
  flagLabel?: string;
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
        const lead = leadIds?.has(s.id) ?? false;
        // A cushion belongs to a mic, so only a vocal strip has one.
        const cushion = s.kind === "vocal" && s.colour ? micColourDot(s.colour) : null;

        const title = [
          `Channel ${stripNumber(s.number, s.stereo)}`,
          s.stereo ? "stereo pair" : null,
          deskLabel(s.label),
          s.who,
          s.kind === "vocal" && s.colour ? `${micColourLabel(s.colour)} cushion` : null,
          s.mic,
          lead ? "lead" : null,
          swapped ? flagLabel : null,
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
                lead
                  ? "border-brass-soft bg-brass-soft text-ivory"
                  : open
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
              {/*
                WHO, then WHAT THE STRIP IS FOR.

                Sailavan: "we need to see what we have allocated for each channel
                in the sound desk area as well as the allocated person or
                instrument." They are two different facts and the desk needs
                both — channel 3 is the third lead vocal mic on the desk, and
                tonight Prasanna is on it.

                The person is the bold line, because that is what changes and
                what the desk is looking for. The strip's own name sits under it,
                and only when it says something the person does not: a bare
                "Channel 12" is the number already printed above.
              */}
              <span className="block w-full truncate text-[12px] font-bold leading-tight">
                {s.who ?? deskLabel(s.label) ?? "—"}
              </span>
              {[s.who ? deskLabel(s.label) : null, s.mic].filter(Boolean).length > 0 ? (
                <span className="mt-0.5 block w-full truncate text-[9px] leading-none opacity-80">
                  {[s.who ? deskLabel(s.label) : null, s.mic].filter(Boolean).join(" · ")}
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
