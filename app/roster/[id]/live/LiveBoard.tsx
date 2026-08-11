"use client";

import Link from "next/link";
import { DeitySymbols } from "@/components/DeitySymbol";
import { useMicCushions, cushionTint } from "@/components/MicCushions";
import { MIC_COLOURS } from "@/lib/micCushion";

export type LiveSlot = {
  position: number;
  singerId: string | null;
  singerName: string;
  bhajanTitle: string;
  bhajanId: string | null;
  deities: string[];
  raga: string | null;
  confirmedPitch: string | null;
  tablaPitch: string | null;
};

export type LiveInstrument = { instrument: string; person: string | null };

/**
 * The performance view: what the harmonium, tabla and sound desk actually read
 * during a session.
 *
 * Rendered as a fixed overlay rather than an ordinary page. The root layout
 * gives every page the sidebar and the site header, and this view is meant to
 * be the whole screen — covering them is far more robust than trying to hide
 * them from a child route, and Escape or the exit button returns.
 *
 * Everything editable is deliberately absent. The one thing that stays LIVE is
 * the mic cushion colour, which is the piece that genuinely changes mid-session
 * and which the sound desk is watching for.
 */
export function LiveBoard({
  sessionId,
  heading,
  subheading,
  slots,
  instruments,
}: {
  sessionId: string;
  heading: string;
  subheading: string;
  slots: LiveSlot[];
  instruments: LiveInstrument[];
}) {
  const cushions = useMicCushions(sessionId);

  /*
   * A typical weekday session is three or four bhajans (CLAUDE.md: 163 of 188),
   * and at that size the cards should own the screen rather than sit in a
   * short stack with empty space beneath. Cards flex to fill the viewport, so
   * three of them are a third of the height each; a long Sunday or festival
   * session hits the minimum height and scrolls as before.
   */
  const roomy = slots.length > 0 && slots.length <= 4;

  /*
   * Type scales with the viewport, not with the slot count, so a three-bhajan
   * session genuinely fills a laptop screen while the same three on a phone
   * stay readable. clamp() does this without a resize listener, and the floors
   * are the sizes used when the list is long enough to scroll.
   *
   * vmin, NOT vh. Scaling off height alone ignored how narrow the column is:
   * on a phone held upright, 390x844, 6vh came to a 50px title inside a 390px
   * card, so every title wrapped to four lines and the cards overlapped. vmin
   * follows whichever dimension is scarcer, which is the one that decides
   * whether the text fits. Landscape and desktop are unaffected — their
   * smaller dimension is the height that was already being used.
   */
  const fill = roomy
    ? {
        title: { fontSize: "clamp(22px, 5.2vmin, 52px)" },
        pitch: { fontSize: "clamp(22px, 5.4vmin, 54px)" },
        singer: { fontSize: "clamp(15px, 2.6vmin, 28px)" },
        // Deliberately well under the pitch: the tabla player needs to read it
        // across a hall, but it must never be mistaken for the shruti at a
        // glance. Roughly two thirds.
        tabla: { fontSize: "clamp(14px, 3.4vmin, 34px)" },
        raga: { fontSize: "clamp(13px, 2.4vmin, 26px)" },
      }
    : { title: undefined, pitch: undefined, singer: undefined, tabla: undefined, raga: undefined };

  return (
    <div className="fixed inset-0 z-[100] flex overflow-hidden bg-ground text-on-ground">
      {/*
        The date as a vertical rail. It has to stay on screen — you need to
        know which session you are looking at — but horizontally it was
        spending a whole line of height on something read once. Down the edge it
        costs 36px of width and no height at all.
      */}
      <aside className="flex w-9 shrink-0 flex-col items-center justify-between border-r border-rule bg-surface/50 py-3">
        <Link
          href={`/roster/${sessionId}`}
          aria-label="Exit live view"
          title="Exit live view"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-surface text-[15px] leading-none text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
        >
          <span aria-hidden>×</span>
        </Link>

        {/* vertical-rl + rotate-180 reads bottom-to-top, which keeps the date
            upright from the left edge rather than upside down. */}
        <div className="flex min-h-0 flex-1 items-center py-3">
          <p className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-xs font-semibold tracking-wide">
            {heading}
            {/*
              A LOGICAL margin, not ml-3. In writing-mode: vertical-rl the
              inline axis runs top to bottom, so margin-left pushes along the
              block axis and produced no gap at all — the date and the count
              ran together as "…20263 bhajans". margin-inline-start follows the
              text direction whichever way it is flowing.
            */}
            <span className="ms-3 font-normal text-on-ground-muted">{subheading}</span>
          </p>
        </div>

        <span aria-hidden className="h-7 w-7" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-auto px-3 py-3 sm:px-5 sm:py-4">
        <ol className={`flex min-h-0 flex-col gap-2.5 ${roomy ? "flex-1" : ""}`}>
          {slots.map((s) => {
            const tint = cushionTint(cushions.get(s.singerId ?? "")?.colour ?? null);
            const dot = MIC_COLOURS.find(
              (c) => c.value === cushions.get(s.singerId ?? "")?.colour,
            );
            return (
              <li
                key={s.position}
                className={`flex flex-col justify-center rounded-[14px] border border-card-edge bg-surface p-4 sm:p-5 ${
                  roomy ? "min-h-[104px] flex-1" : ""
                }`}
                style={
                  tint ? { background: tint.row, boxShadow: `inset 5px 0 0 0 ${tint.edge}` } : undefined
                }
                title={dot ? `${dot.label} mic cushion` : undefined}
              >
                {/*
                  Row when the screen is landscape, stacked when it is portrait
                  — orientation, not width.
                  
                  Width alone got this wrong in both directions. Side by side
                  from a width breakpoint squeezed the title into a ~160px
                  column on a portrait tablet, because the pitch box does not
                  shrink; stacking below that breakpoint then broke a phone held
                  sideways, where three cards share 390px of height and there is
                  no room to put the pitch under the title. Stacking needs
                  vertical room and a row needs horizontal room, which is what
                  the aspect ratio actually tells us.
                */}
                <div className="flex flex-col gap-3 [@media(min-aspect-ratio:1/1)]:flex-row [@media(min-aspect-ratio:1/1)]:items-center [@media(min-aspect-ratio:1/1)]:justify-between [@media(min-aspect-ratio:1/1)]:gap-6">
                  <div className="min-w-0 flex-1">
                    {/* Bhajan — the biggest thing on the row, as asked. */}
                    <div className="flex items-center gap-2.5">
                      <span className="shrink-0 font-mono text-sm text-on-surface-muted">
                        {s.position}
                      </span>
                      <DeitySymbols deities={s.deities} size={22} />
                      <h2
                        className="min-w-0 break-words font-display text-2xl font-semibold leading-tight sm:text-[28px]"
                        style={fill.title}
                      >
                        {s.bhajanTitle}
                      </h2>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
                      <span className="text-lg font-medium sm:text-xl" style={fill.singer}>
                        {s.singerName}
                      </span>
                      {/* Raga sits with the cushion rather than with the title:
                          both are things you glance at, where the title and the
                          pitch are things you read. */}
                      {/*
                        No "Blue mic" chip. The card is already washed in the
                        cushion colour, which says the same thing without
                        spending a line on it. Kept for anyone who cannot use
                        the colour: the card carries it as a tooltip and as
                        screen-reader text, so removing the visible label loses
                        nothing but the clutter.
                      */}
                      {dot ? <span className="sr-only">{dot.label} mic cushion</span> : null}
                    </div>
                  </div>

                  {/* Confirmed pitch — the other thing that has to read from a
                      distance. Tabla sits under it, quietly. */}
                  <div className="flex shrink-0 items-end gap-4 [@media(min-aspect-ratio:1/1)]:flex-col [@media(min-aspect-ratio:1/1)]:items-end [@media(min-aspect-ratio:1/1)]:gap-1">
                    <div
                      className="rounded-[12px] border-2 border-brass/45 bg-field px-3 py-1.5 font-mono text-2xl font-semibold leading-none sm:text-[30px]"
                      style={fill.pitch}
                    >
                      {s.confirmedPitch ?? "—"}
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      {/*
                        Raga belongs with the pitch, not with the singer:
                        whoever is on harmonium reads them together.

                        Width-capped and wrapping on purpose. This column does
                        not shrink, and raga names are often dual —
                        "Shankarabharanam / Bilawal" — so an uncapped one would
                        widen the column and squeeze the title back into a
                        one-word-per-line stack, which is the failure this
                        layout was just fixed for.
                      */}
                      {s.raga ? (
                        <span
                          className="max-w-[18ch] break-words text-right text-base italic leading-tight text-on-surface-muted"
                          style={fill.raga}
                          title={`Raga ${s.raga}`}
                        >
                          {s.raga}
                        </span>
                      ) : null}
                      <div className="text-base text-on-surface-muted" style={fill.tabla}>
                        <span className="text-[0.62em] uppercase tracking-wide">tabla</span>{" "}
                        <span className="font-mono">{s.tablaPitch ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
          {slots.length === 0 ? (
            <li className="rounded-[14px] border border-card-edge bg-surface p-5 text-on-surface-muted">
              No bhajans on this session yet.
            </li>
          ) : null}
        </ol>

        {instruments.length > 0 ? (
          <section className="mt-5 rounded-[14px] border border-card-edge bg-surface p-4 sm:p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
              Instruments
            </h2>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              {instruments.map((i, idx) => (
                <li key={idx} className="text-lg">
                  <span className="text-on-surface-muted">{i.instrument}</span>{" "}
                  <span className="font-medium">{i.person ?? "—"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
