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
        title: { fontSize: "clamp(20px, 4.4vmin, 44px)" },
        // A clear step down at each level, in reading order: pitch, raga,
        // tabla. Sized so the widest label, "1.5 Madhyam / F#", still sits on
        // one line in the full-width box — a wrapped shruti is a misread.
        pitch: { fontSize: "clamp(20px, 4.8vmin, 48px)" },
        raga: { fontSize: "clamp(15px, 3.4vmin, 34px)" },
        tabla: { fontSize: "clamp(13px, 2.8vmin, 28px)" },
        singer: { fontSize: "clamp(14px, 2.4vmin, 24px)" },
      }
    : { title: undefined, pitch: undefined, singer: undefined, tabla: undefined, raga: undefined };

  return (
    /*
      h-[100dvh] as well as inset-0. On Chrome for Android the address bar
      hides and shows as you scroll and the layout viewport changes underneath
      a position:fixed element, so the board could sit misaligned against the
      screen — Safari on iPhone happened not to show it. dvh tracks the visible
      viewport, and overscroll-none stops the pull-to-refresh rubber band
      dragging the whole board with it.
    */
    <div className="fixed inset-0 z-[100] flex h-[100dvh] overflow-hidden overscroll-none bg-ground text-on-ground">
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
                /*
                  min-h-fit matters more than flex-1 does. A card may GROW to
                  share the screen, but it must never shrink below its own
                  content: stacked, a card is a title plus three boxes plus the
                  singer, and three of those do not fit in a phone's 390px of
                  landscape height. Without this the boxes were clipped rather
                  than the list scrolling, which is the wrong failure — better
                  to scroll than to hide the pitch.
                */
                className={`flex flex-col justify-center rounded-[14px] border border-card-edge bg-surface p-3 sm:p-4 ${
                  roomy ? "min-h-fit flex-1" : ""
                }`}
                style={
                  tint ? { background: tint.row, boxShadow: `inset 5px 0 0 0 ${tint.edge}` } : undefined
                }
                title={dot ? `${dot.label} mic cushion` : undefined}
              >
                {/*
                  One column, every screen. This used to switch between a row
                  and a stack on the viewport's aspect ratio, which was where
                  Chrome on Android disagreed with Safari on iPhone: the two
                  report different viewport heights as the address bar hides
                  and shows, so the same phone could land either side of the
                  1/1 boundary and the card would rearrange under you. A single
                  column cannot disagree with itself.
                */}
                <div className="flex min-w-0 flex-col gap-1.5">
                  {/* Bhajan — unchanged, still the headline. */}
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

                  {/*
                    Pitch, then raga, then tabla — each in its own box, each a
                    step smaller, in the order they are read. Full width so the
                    pitch never wraps: "1.5 Madhyam / F#" on two lines is a
                    misread waiting to happen.
                  */}
                  <div
                    className="w-full whitespace-nowrap rounded-[12px] border-2 border-brass/45 bg-field px-3 py-1 text-center font-mono text-2xl font-semibold leading-none sm:text-[30px]"
                    style={fill.pitch}
                  >
                    {s.confirmedPitch ?? "—"}
                  </div>

                  <div
                    className="w-full truncate rounded-[10px] border border-rule-surface bg-field/60 px-3 py-0.5 text-center italic leading-tight text-on-surface"
                    style={fill.raga}
                    title={s.raga ? `Raga ${s.raga}` : undefined}
                  >
                    {s.raga ?? "raga not recorded"}
                  </div>

                  <div
                    className="w-full whitespace-nowrap rounded-[10px] border border-rule-surface bg-field/60 px-3 py-0.5 text-center leading-none text-on-surface-muted"
                    style={fill.tabla}
                  >
                    <span className="text-[0.6em] uppercase tracking-wide">tabla</span>{" "}
                    <span className="font-mono text-on-surface">{s.tablaPitch ?? "—"}</span>
                  </div>

                  {/* Singer, bottom right. */}
                  <div className="flex justify-end">
                    <span className="font-medium" style={fill.singer}>
                      {s.singerName}
                    </span>
                    {dot ? <span className="sr-only">{dot.label} mic cushion</span> : null}
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
