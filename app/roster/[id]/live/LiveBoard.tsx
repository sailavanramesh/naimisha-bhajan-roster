"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DeitySymbols } from "@/components/DeitySymbol";
import { useMicCushions, cushionTint } from "@/components/MicCushions";
import { useSessionVersion } from "@/components/useSessionVersion";
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
  tablaWhy?: string | null;
  /** For the words sheet. Null when the row is not a masterlist bhajan. */
  lyrics?: string | null;
};

export type LiveInstrument = { instrument: string; person: string | null };

/**
 * Everything on a row that is worth noticing a change to — which is all of it.
 *
 * The mic cushion was left out at first, on the reasoning that it has its own
 * live colour and changes often enough that ringing the row each time would
 * wear the ring out. Sailavan wanted it in, and he is the one at the desk:
 * from there a cushion swap is exactly the kind of change you need to catch,
 * and the person who made it is standing in the same hall.
 */
function rowSignature(s: LiveSlot, cushion: string | null): string {
  return [s.singerName, s.bhajanTitle, s.confirmedPitch, s.tablaPitch, s.raga, cushion].join(
    "\u0000",
  );
}

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
  categoryName,
  categoryImage,
  slots,
  instruments,
}: {
  sessionId: string;
  heading: string;
  subheading: string;
  /** The kind of session, shown as a mark at the foot of the rail. */
  categoryName?: string | null;
  categoryImage?: string | null;
  slots: LiveSlot[];
  instruments: LiveInstrument[];
}) {
  const cushions = useMicCushions(sessionId);
  /*
   * The rest of the board, kept current too.
   *
   * Cushions have always polled. Everything else — bhajan, pitch, tabla, the
   * running order — was read once at open, so a change made while this was up
   * on a stand never arrived. This is the screen that has to be right during
   * a session, so it is the last one that should be showing yesterday.
   */
  useSessionVersion(sessionId);

  /*
   * Which rows have just changed.
   *
   * The refresh is silent by design — nothing flashes the whole board — so
   * without this the desk sees only that a line now reads differently, never
   * that it moved. Compared against what was on screen a moment ago rather
   * than against the server, because what matters is what this person was
   * looking at.
   *
   * The FIRST render sets the baseline and glows nothing: arriving at a page
   * is not a change.
   */
  /*
   * Each entry is a row that changed, against a nonce that increases every
   * time. The nonce is the whole trick: it goes into the row's React key, so a
   * changed row is a NEW element and the CSS animation starts from the
   * beginning.
   *
   * Without it the ring fired exactly once and never again. Re-adding a class
   * an element already has does not restart an animation, and the class was
   * never coming off — the effect re-runs every four seconds when the cushion
   * poll returns a fresh Map, and its cleanup killed the timeout that was
   * meant to remove it. So the first change rang, the class stuck, the
   * animation finished, and every change after that was silent. Exactly what
   * Sailavan described.
   */
  const [changed, setChanged] = useState<Map<number, number>>(new Map());
  const seen = useRef<Map<number, string> | null>(null);
  const nonce = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const now = new Map(
      slots.map((s) => [
        s.position,
        rowSignature(s, cushions.get(s.singerId ?? "")?.colour ?? null),
      ]),
    );
    /*
     * Nothing rings until the cushions have arrived once.
     *
     * The cushion map starts empty and fills a moment after the board opens,
     * so treating that first fill as a change rang every row that had a
     * cushion — at the one moment when nothing had changed. The baseline is
     * simply not taken until the board is showing everything it is going to
     * show.
     *
     * This is per DEVICE, which is the point: each screen rings for what has
     * changed since IT opened, so a phone joining at 6.55 does not inherit a
     * tablet's history.
     */
    if (!cushions.ready) {
      seen.current = null;
      return;
    }

    const before = seen.current;
    seen.current = now;
    if (!before) return;

    const moved = [...now.entries()]
      .filter(([position, sig]) => before.has(position) && before.get(position) !== sig)
      .map(([position]) => position);
    if (moved.length === 0) return;

    nonce.current += 1;
    const mine = nonce.current;
    setChanged((prev) => {
      const next = new Map(prev);
      for (const position of moved) next.set(position, mine);
      return next;
    });

    /*
     * One timer per row, held in a ref rather than returned as cleanup —
     * this effect re-runs on every cushion poll, and a cleanup would cancel
     * the removal of a ring that is still mid-pulse.
     */
    for (const position of moved) {
      const running = timers.current.get(position);
      if (running) clearTimeout(running);
      timers.current.set(
        position,
        setTimeout(() => {
          timers.current.delete(position);
          setChanged((prev) => {
            if (prev.get(position) !== mine) return prev; // a newer change owns it
            const next = new Map(prev);
            next.delete(position);
            return next;
          });
        }, 6200),
      );
    }
    /*
     * `cushions` is a fresh Map on every poll, so this runs every four seconds
     * whether anything moved or not. That is fine and deliberate: the
     * comparison is by VALUE, so an unchanged poll produces identical
     * signatures and rings nothing.
     */
  }, [slots, cushions]);

  // The timers outlive the effect, so they are cleared when the board goes.
  useEffect(() => {
    const running = timers.current;
    return () => {
      running.forEach(clearTimeout);
      running.clear();
    };
  }, []);
  /** Which card's words are open, by position. Null for none. */
  const [words, setWords] = useState<number | null>(null);
  const openSlot = words === null ? null : (slots.find((s) => s.position === words) ?? null);

  // Escape closes the words before it would exit the live view itself.
  useEffect(() => {
    if (openSlot === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setWords(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openSlot]);

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

  /*
    h-[100dvh] as well as inset-0. On Chrome for Android the address bar hides
    and shows as you scroll and the layout viewport changes underneath a
    position:fixed element, so the board could sit misaligned against the
    screen — Safari on iPhone happened not to show it. dvh tracks the visible
    viewport, and overscroll-none stops the pull-to-refresh rubber band
    dragging the whole board with it.
  */
  return (
    <>
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

        {/*
          The session's kind, at the foot of the rail.
          
          It balances the exit button at the top, so the rail reads as a
          deliberate column rather than a control with space under it — and it
          is the one place on this screen where something decorative costs
          nothing, because the cards own the rest and nobody reads the rail
          twice. The name is in the tooltip rather than on screen: at 36px wide
          there is no honest way to show it, and the picture is the point.
        */}
        {categoryImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={categoryImage}
            alt=""
            title={categoryName ?? undefined}
            className="h-7 w-7 rounded-full border border-rule object-cover opacity-90"
          />
        ) : (
          <span aria-hidden className="h-7 w-7" />
        )}
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
                /*
                  The nonce makes this a new element on every change, which is
                  what restarts the animation. Nothing inside a card holds
                  state, so remounting costs nothing.
                */
                key={`${s.position}:${changed.get(s.position) ?? 0}`}
                /*
                  min-h-fit matters more than flex-1 does. A card may GROW to
                  share the screen, but it must never shrink below its own
                  content: stacked, a card is a title plus three boxes plus the
                  singer, and three of those do not fit in a phone's 390px of
                  landscape height. Without this the boxes were clipped rather
                  than the list scrolling, which is the wrong failure — better
                  to scroll than to hide the pitch.
                */
                className={[
                  "flex flex-col justify-center rounded-[14px] border border-card-edge bg-surface p-3 sm:p-4",
                  roomy ? "min-h-fit flex-1" : "",
                  changed.has(s.position) ? "live-row-changed" : "",
                ].join(" ")}
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
                    {/* The drum to tune, not the fifth of the shruti. */}
                    <span className="text-[0.6em] uppercase tracking-wide">tabla</span>{" "}
                    <span className="font-mono text-on-surface">{s.tablaPitch ?? "—"}</span>
                    {s.tablaPitch ? null : (
                      <span className="ml-1 text-[0.55em] uppercase tracking-wide text-warn">
                        none fits
                      </span>
                    )}
                  </div>

                  {/*
                    The words, without leaving.
                    
                    Sailavan: singers want the lyrics up during a session and
                    must be able to get back "without losing it". So this opens
                    a sheet OVER the live view rather than navigating anywhere —
                    nothing is unmounted, no scroll position is lost, and the
                    full details page is one more tap away in a new tab for
                    whoever wants the meaning or the audio.
                  */}
                  {s.lyrics || s.bhajanId ? (
                    <button
                      type="button"
                      onClick={() => setWords(s.position)}
                      className="self-center rounded-full border border-rule-surface px-3 py-0.5 text-[11px] uppercase tracking-wide text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
                    >
                      words
                    </button>
                  ) : null}

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

      {/*
        The words sheet.

        Sits above the live view at a higher z-index rather than replacing it,
        so closing it restores the board exactly — same scroll, same live mic
        cushions, no refetch. On a phone it is the whole screen, because that
        is what reading lyrics wants.
      */}
      {openSlot ? (
        <div
          /* Above the board's own z-[100], or the board paints over it and
             swallows the clicks — which is exactly what happened first time. */
          className="fixed inset-0 z-[120] flex flex-col bg-ground/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Words for ${openSlot.bhajanTitle}`}
          onClick={() => setWords(null)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-2xl flex-col p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-rule pb-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold text-on-ground sm:text-2xl">
                  {openSlot.bhajanTitle}
                </h2>
                <p className="mt-0.5 text-xs text-on-ground-muted">
                  {openSlot.singerName}
                  {openSlot.confirmedPitch ? ` · ${openSlot.confirmedPitch}` : ""}
                  {openSlot.raga ? ` · ${openSlot.raga}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWords(null)}
                className="shrink-0 rounded-key border border-rule px-3 py-1.5 text-sm text-on-ground hover:bg-white/[0.08]"
              >
                Back
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto py-4">
              {openSlot.lyrics ? (
                <p className="whitespace-pre-wrap font-display text-lg leading-relaxed text-on-ground sm:text-xl">
                  {openSlot.lyrics}
                </p>
              ) : (
                <p className="text-sm text-on-ground-muted">
                  No words recorded for this bhajan.
                </p>
              )}
            </div>

            {openSlot.bhajanId ? (
              <Link
                href={`/bhajans/${openSlot.bhajanId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 border-t border-rule pt-3 text-sm text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
              >
                Meaning, audio and details ↗
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
