"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeitySymbols } from "@/components/DeitySymbol";
import { useMicCushions, cushionTint } from "@/components/MicCushions";
import { useSessionVersion } from "@/components/useSessionVersion";
import { hasMoreBelow, isRowSeen, movedRows } from "@/lib/liveBoard";
import { MIC_COLOURS, micColourDot, micColourLabel, type MicColourValue } from "@/lib/micCushion";

export type LiveSlot = {
  position: number;
  singerId: string | null;
  singerName: string;
  /** Who is on the chorus mic for this bhajan, if anybody. */
  chorusName: string | null;
  /** That mic's cushion colour, which tints the chorus line. */
  chorusCushion: MicColourValue | null;
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
  return [
    s.singerName,
    s.bhajanTitle,
    s.confirmedPitch,
    s.tablaPitch,
    s.raga,
    cushion,
    // The chorus mic counts for the same reason the lead cushion does: it is a
    // change made in the hall, by somebody standing in it, that the desk has to
    // catch.
    s.chorusName,
    s.chorusCushion,
  ].join("\u0000");
}

/**
 * Who is on the chorus mic, under the singer who is leading.
 *
 * Smaller than the lead singer, because that is the relationship — the desk
 * reads the lead first and the chorus as a qualifier. Tinted with the CHORUS
 * mic's own cushion colour, which is stored on the row rather than against the
 * person: the same singer may lead one bhajan on blue and chorus another on
 * green, and a colour keyed by person could not say both.
 *
 * A dot as well as the colour, and the colour name in the title. Colour alone
 * is not something to hang a cue on — somebody colour-blind at the desk still
 * has to know which cushion is meant.
 */
function ChorusLine({
  name,
  cushion,
  dense = false,
}: {
  name: string | null;
  cushion: MicColourValue | null;
  dense?: boolean;
}) {
  if (!name) return null;
  const dot = micColourDot(cushion);
  // micColourLabel, not a lookup in MIC_COLOURS: green is the chorus-only
  // colour and is not in that list at all, so it would never resolve.
  const label = cushion ? micColourLabel(cushion) : null;

  return (
    <span
      className={`flex items-center gap-1 leading-tight ${dense ? "text-[12px]" : "text-sm"}`}
      style={dot ? { color: dot } : undefined}
      title={label ? `${label} chorus mic` : "Chorus mic"}
    >
      {dot ? (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      ) : null}
      <span className={dot ? "" : "text-on-surface-muted"}>{name}</span>
      <span className="sr-only">
        {label ? ` on the ${label.toLowerCase()} chorus mic` : " on the chorus mic"}
      </span>
    </span>
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
}: {
  sessionId: string;
  heading: string;
  subheading: string;
  /** The kind of session, shown as a mark at the foot of the rail. */
  categoryName?: string | null;
  categoryImage?: string | null;
  slots: LiveSlot[];
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

  /*
   * The scrolling part of the board, and whether there is anything under the
   * bottom edge of it.
   *
   * A long Sunday or festival session does not fit on one screen, and until now
   * nothing said so: the list simply ended at the edge of the glass. Sailavan,
   * on a stand in the hall — "otherwise we may not know".
   */
  const scroller = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);

  /*
   * Rows that have changed while out of sight, held until they are actually
   * looked at.
   *
   * Deliberately NOT tied to the six-second ring. A ring is for a row you can
   * see; a row below the fold has to keep saying so until somebody scrolls to
   * it, however long that takes. So this is a ref that measure() prunes as
   * rows come into view, rather than something a timer clears.
   */
  const unseen = useRef<Set<number>>(new Set());
  const [unseenBelow, setUnseenBelow] = useState(false);

  /**
   * Is there more below, and is any of it something that just changed?
   *
   * Rectangles rather than offsetTop: the cards' offsetParent is the fixed
   * root, not the scroller, so the two are only accidentally in the same
   * coordinate space and one day would not be.
   */
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;

    setMore(hasMoreBelow(el));

    const box = el.getBoundingClientRect();
    for (const position of [...unseen.current]) {
      const row = el.querySelector<HTMLElement>(`[data-position="${position}"]`);
      // Gone from the running order entirely — nothing left to go and look at.
      if (!row) {
        unseen.current.delete(position);
        continue;
      }
      if (isRowSeen(row.getBoundingClientRect().top, box.bottom)) unseen.current.delete(position);
    }
    setUnseenBelow(unseen.current.size > 0);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    /*
     * Two observers, because the two things that change are different. The
     * scroller resizes when the phone turns or Chrome's address bar slides
     * away; the list inside it grows when a row is added and the scroller
     * itself never changes size at all.
     */
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const list = el.firstElementChild;
    if (list) ro.observe(list);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

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

    /*
     * An ADDED row counts as a change too — see movedRows.
     *
     * This used to require `before.has(position)`, so a bhajan added while the
     * board was up arrived in total silence: the one kind of change you would
     * think hardest to miss. The first-render guard above is what makes it
     * safe: at open, `before` is null and we return before getting here, so
     * arriving at a session does not ring all four rows.
     */
    const moved = movedRows(before, now);
    if (moved.length === 0) return;

    // Assume unseen; measure() clears the ones that are on screen right now.
    for (const position of moved) unseen.current.add(position);

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

  /*
   * Re-measure once the DOM has caught up with a new running order. The
   * observers cover a list that changed HEIGHT; this covers the rest — a row
   * swapped for another of the same size, and the freshly-marked unseen set
   * needing its first prune against what is actually on screen.
   */
  useEffect(measure, [slots, changed, measure]);
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
   * Three ways to lay this out, decided only by how many bhajans there are.
   *
   * ROOMY (1–3): the cards own the screen. A short session should not be a
   * small stack with empty space beneath it, so cards flex to fill.
   *
   * DENSE (4+): Sailavan asked for less scrolling without losing readability.
   * The cards lose their full-width boxes and put the pitch beside the title
   * instead of under it, which roughly halves a card's height, and on a screen
   * wide enough they run in two or three columns. Four bhajans then fit on a
   * phone in portrait where before they scrolled.
   *
   * The columns key on WIDTH, never on aspect ratio. That distinction is the
   * whole reason the card interior below is a single column: keying on the
   * ratio is what made Chrome on Android and Safari on iPhone disagree, because
   * the two report different viewport HEIGHTS as the address bar hides, so the
   * same phone could land either side of the boundary and the layout would
   * rearrange under you. Width does not move when the address bar does.
   */
  const roomy = slots.length > 0 && slots.length <= 3;
  const dense = slots.length >= 4;

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

      {/* scroll-smooth in CSS rather than behavior:"smooth" in the scrollBy
          call, so the global prefers-reduced-motion rule can turn it off. */}
      <div
        ref={scroller}
        className="flex min-w-0 flex-1 scroll-smooth flex-col overflow-auto px-3 py-3 sm:px-5 sm:py-4"
      >
        <ol
          className={
            dense
              ? /*
                  Columns on width alone. minmax(0,1fr) so a long title wraps
                  instead of widening its column and the page with it.

                  Deliberately NOT auto-rows-fr with a full-height grid, which
                  was tried: it filled the spare height on a four-bhajan screen,
                  which looked better, and squashed nineteen rows until the
                  pitch was clipped. `auto` did not hold as a floor once the
                  cards were centring their own content. Spare height at the
                  bottom is a cosmetic loss; a clipped shruti is a misread, and
                  this file already chose scrolling over hiding once before.
                */
                "grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-3"
              : `flex min-h-0 flex-col gap-2.5 ${roomy ? "flex-1" : ""}`
          }
        >
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
                // How measure() finds a row to ask whether it is on screen.
                data-position={s.position}
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
                  "flex min-w-0 flex-col justify-center rounded-[14px] border border-card-edge bg-surface",
                  dense ? "p-2.5 sm:p-3" : "p-3 sm:p-4",
                  roomy ? "min-h-fit flex-1" : "",
                  changed.has(s.position) ? "live-row-changed" : "",
                ].join(" ")}
                style={
                  tint ? { background: tint.row, boxShadow: `inset 5px 0 0 0 ${tint.edge}` } : undefined
                }
                title={dot ? `${dot.label} mic cushion` : undefined}
              >
                {dense ? (
                  /*
                    The dense card: two lines instead of five.

                    The pitch moves BESIDE the title rather than under it, which
                    is what buys most of the height back, and it keeps its box
                    and its weight because it is still the thing the harmonium
                    reads first. Raga and tabla drop to one shared line — they
                    are reference, not performance — and the singer sits at the
                    end of that line rather than owning one of its own.
                  */
                  <div className="flex min-w-0 flex-col gap-1">
                    {/*
                      The pitch under the title, always.

                      Side by side was tried and keyed on the VIEWPORT width,
                      which is the wrong measure: at 844px the board goes to two
                      columns, so each card is about 380px — NARROWER than the
                      390px card in portrait, where stacking was already needed.
                      The two rules compounded and clipped the titles again.
                      What actually matters is the card-s width, and until this
                      file has container queries, one consistent arrangement
                      beats a breakpoint that measures the wrong thing.
                    */}
                    <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 font-mono text-xs text-on-surface-muted">
                        {s.position}
                      </span>
                      <DeitySymbols deities={s.deities} size={18} />
                      {/*
                        Two lines, not one.

                        `truncate` here cut "Ambika Tava Darshanam" to "Ambika
                        Ta…" on a phone, because the pitch box rightly wins the
                        width contest — and the title is the one thing on the
                        card a singer is looking for. Height was never the thing
                        that was scarce at this size: four bhajans used a third
                        of the screen. So the title gets the room to wrap, and
                        stops at two lines so a long one cannot push the card
                        out of the count that made it dense in the first place.
                      */}
                      <h2 className="line-clamp-2 min-w-0 flex-1 break-words font-display text-lg font-semibold leading-tight sm:text-xl">
                        {s.bhajanTitle}
                      </h2>
                      {/* whitespace-nowrap and shrink-0: "1.5 Madhyam / F#"
                          wrapped is a misread, and it must win the space
                          contest against a long title rather than lose it. */}
                      </div>

                      {/* Full width when stacked so it reads like the roomy
                          card's box; beside the title when there is room. */}
                      <span className="w-full shrink-0 whitespace-nowrap rounded-[10px] border-2 border-brass/45 bg-field px-2 py-1 text-center font-mono text-lg font-semibold leading-none">
                        {s.confirmedPitch ?? "\u2014"}
                      </span>
                    </div>

                    <div className="flex min-w-0 items-end justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] text-on-surface-muted">
                        <span className="italic">{s.raga ?? "raga not recorded"}</span>
                        {" \u00b7 tabla "}
                        <span className="font-mono text-on-surface">{s.tablaPitch ?? "\u2014"}</span>
                        {s.tablaPitch ? null : (
                          <span className="ml-1 uppercase tracking-wide text-warn">none fits</span>
                        )}
                        {s.lyrics || s.bhajanId ? (
                          <>
                            {" \u00b7 "}
                            <button
                              type="button"
                              onClick={() => setWords(s.position)}
                              className="uppercase tracking-wide underline underline-offset-2 hover:text-on-surface"
                            >
                              words
                            </button>
                          </>
                        ) : null}
                      </span>

                      <span className="flex shrink-0 flex-col items-end leading-tight">
                        <span className="text-[15px] font-medium">{s.singerName}</span>
                        <ChorusLine name={s.chorusName} cushion={s.chorusCushion} dense />
                        {dot ? <span className="sr-only">{dot.label} mic cushion</span> : null}
                      </span>
                    </div>
                  </div>
                ) : (
                /*
                  One column, every screen. This used to switch between a row
                  and a stack on the viewport\'s aspect ratio, which was where
                  Chrome on Android disagreed with Safari on iPhone: the two
                  report different viewport heights as the address bar hides
                  and shows, so the same phone could land either side of the
                  1/1 boundary and the card would rearrange under you. A single
                  column cannot disagree with itself.
                */
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
                    {s.confirmedPitch ?? "\u2014"}
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
                    <span className="font-mono text-on-surface">{s.tablaPitch ?? "\u2014"}</span>
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

                  {/* Singer, bottom right, with the chorus mic beneath. */}
                  <div className="flex flex-col items-end">
                    <span className="font-medium" style={fill.singer}>
                      {s.singerName}
                    </span>
                    <ChorusLine name={s.chorusName} cushion={s.chorusCushion} />
                    {dot ? <span className="sr-only">{dot.label} mic cushion</span> : null}
                  </div>
                </div>
                )}
              </li>
            );
          })}
          {slots.length === 0 ? (
            <li className="rounded-[14px] border border-card-edge bg-surface p-5 text-on-surface-muted">
              No bhajans on this session yet.
            </li>
          ) : null}
        </ol>
      </div>

      {/*
        There is more below.

        Discrete on purpose — a small ringed arrow at the bottom right, the
        corner a thumb already rests on, and gone the moment the list ends. It
        is a BUTTON rather than a decoration because on a stand at arm's length
        the arrow is also the easiest place to press to see what it is pointing
        at, and because the alternative fails the keyboard.

        It brightens and nudges when a row has changed or been added out of
        sight. That is the case Sailavan guessed it would cover: the ring on a
        changed row is no use at all if the row is under the bottom edge, and
        the arrow is the only thing on screen that can say "down there".
      */}
      {more ? (
        <button
          type="button"
          onClick={() => {
            const el = scroller.current;
            // Not a whole screen: leaving a sliver of the last card visible is
            // what tells you the two views are the same list.
            el?.scrollBy({ top: Math.round(el.clientHeight * 0.85) });
          }}
          aria-label={
            unseenBelow
              ? "More bhajans below, including one that has just changed. Scroll down."
              : "More bhajans below. Scroll down."
          }
          title={unseenBelow ? "Something changed below" : "More below"}
          className={[
            /*
              Tucked right into the corner, and small. Cards run the full width
              and put the singer's name at their bottom right, so anything
              bigger or further in starts covering a name — and the only card it
              can ever sit over is the one already cut in half by the bottom
              edge, which is the card the arrow is there to talk about.
            */
            "absolute bottom-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center",
            "rounded-full border bg-surface/80 text-lg leading-none backdrop-blur-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/70",
            unseenBelow
              ? "live-more-unseen border-brass/70 text-brass"
              : "live-more border-rule text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
          ].join(" ")}
        >
          <span aria-hidden>↓</span>
        </button>
      ) : null}
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
