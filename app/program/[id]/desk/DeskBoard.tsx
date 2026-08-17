"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useSessionVersion } from "@/components/useSessionVersion";
import { currentItemOf, occupantFor, shortName, stepItem } from "@/lib/deskChannels";
import { hasMoreBelow } from "@/lib/liveBoard";
import { micColourDot, micColourLabel, type MicColourValue } from "@/lib/micCushion";
import { setCurrentItem } from "../deskActions";

export type DeskChannel = {
  id: string;
  number: string;
  label: string;
  kind: string;
  /** The cushion fixed to this strip. Null is a mic with no cushion. */
  colour: MicColourValue | null;
  /** Which mic is on it — "Wired", "Pegasus", "WL1". Reference only. */
  mic: string | null;
  /** Who or what is usually on the strip. Null on a spare. */
  who: string | null;
};

export type DeskItem = {
  position: number;
  kind: string;
  /** The number the group says out loud. Null for a narration. */
  songNumber: number | null;
  title: string;
  sceneNumber: number | null;
  pitch: string | null;
  who: string;
  played: string;
  openChannelIds: string[];
  /** Strips carrying somebody other than their usual occupant, for this item. */
  swaps: { channelId: string; who: string }[];
};

/**
 * The live desk view of a programme.
 *
 * One question, answered large: which faders are up for the thing happening
 * now. Everything the programme page shows about preparation is deliberately
 * absent — mid-performance the desk is being read at arm's length, in a dark
 * hall, by somebody with one hand on a fader.
 *
 * The current item is SHARED (Session.currentItemPosition), not per device, so
 * pressing Next here moves the phone on the stage and the tablet at the back
 * too. That is the entire point: the failure this replaces is two people
 * looking at different items and each believing the other is wrong.
 *
 * Advancing is gated on `setMicCushion` — live desk state that anybody signed
 * in may move — and not on `editPrograms`. Running the sound is not editing the
 * running order.
 */
export function DeskBoard({
  sessionId,
  heading,
  programName,
  deskName,
  currentPosition,
  items,
  channels,
}: {
  sessionId: string;
  heading: string;
  programName: string;
  deskName: string | null;
  currentPosition: number | null;
  items: DeskItem[];
  channels: DeskChannel[];
}) {
  // Everything read-only on this screen re-fetches when the programme moves
  // underneath it — a channel ticked on the editor, or Next pressed elsewhere.
  useSessionVersion(sessionId);

  const [pending, startTransition] = useTransition();

  /*
   * Where WE think we are, so a press moves the screen at once.
   *
   * The server is still the authority, and its answer arrives on the next
   * render; this only covers the gap between the tap and that, which on a hall
   * wifi is long enough to press Next twice by mistake. Re-synced below when the
   * server's own value changes — including when somebody else advances it.
   */
  const [position, setPosition] = useState<number | null>(currentPosition);
  const lastFromServer = useRef(currentPosition);
  useEffect(() => {
    if (lastFromServer.current === currentPosition) return;
    lastFromServer.current = currentPosition;
    setPosition(currentPosition);
  }, [currentPosition]);

  const item = currentItemOf(items, position);
  const back = stepItem(items, position, -1);
  const on = stepItem(items, position, 1);

  const go = useCallback(
    (to: number | null) => {
      if (to === null) return;
      setPosition(to);
      startTransition(async () => {
        await setCurrentItem({ sessionId, position: to });
      });
    },
    [sessionId],
  );

  // Left and right arrows, because a laptop at the desk is common and reaching
  // for the trackpad between items is not.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") go(on);
      else if (e.key === "ArrowLeft") go(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, on, back]);

  /*
   * The scroll arrow, on the same terms as the bhajan board: a desk with more
   * channels than fit must say so, because a fader you did not know was on the
   * list is the one that stays down.
   */
  const scroller = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setMore(
      hasMoreBelow({
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
      }),
    );
  }, []);

  useLayoutEffect(measure, [measure, item]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

  const openIds = new Set(item?.openChannelIds ?? []);
  const openCount = channels.filter((c) => openIds.has(c.id)).length;
  /*
   * Who is on a strip FOR THIS ITEM, where that is not its usual occupant — a
   * singer's mic taken by the mridangam for one song, or by one head of a
   * two-sided drum. Empty for almost every item, which is why it travels as the
   * exceptions rather than as a name per channel.
   */
  const swaps = new Map((item?.swaps ?? []).map((s) => [s.channelId, s.who]));

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] overflow-hidden overscroll-none bg-ground text-on-ground">
      {/* The date down the edge, as on the bhajan board: it must stay on screen
          and it should not spend a line of height doing so. */}
      <aside className="flex w-9 shrink-0 flex-col items-center justify-between border-r border-rule bg-surface/50 py-3">
        <Link
          href={`/program/${sessionId}`}
          aria-label="Exit desk view"
          title="Exit desk view"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-surface text-[15px] leading-none text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
        >
          <span aria-hidden>×</span>
        </Link>

        <div className="flex min-h-0 flex-1 items-center py-3">
          <p className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-xs font-semibold tracking-wide">
            {heading}
            <span className="ms-3 font-normal text-on-ground-muted">
              {deskName ?? "no desk picked"}
            </span>
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {items.length === 0 || !item ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div>
              <h1 className="font-display text-2xl font-semibold">{programName}</h1>
              <p className="mt-2 text-sm text-on-ground-muted">
                Nothing in the running order yet.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ---- what we are on ---- */}
            <header className="shrink-0 border-b border-rule px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-on-ground-muted">
                  {item.kind === "narration" ? "Reading" : `Song ${item.songNumber ?? ""}`}
                  <span className="ms-2 font-normal normal-case tracking-normal">
                    {`item ${items.findIndex((i) => i.position === item.position) + 1} of ${items.length}`}
                  </span>
                </p>
                {/*
                  The scene number, when the desk has scenes. Nothing recalls it
                  — the MG20XU has no recall of any kind — so it is printed here
                  for the operator to dial in, which is exactly what it is for
                  until an SQ5 exists to be told.
                */}
                {item.sceneNumber !== null ? (
                  <span
                    className="shrink-0 rounded-key border border-brass/60 px-2 py-0.5 text-sm font-semibold text-brass-ink"
                    title="Scene to recall on the desk"
                  >
                    Scene {item.sceneNumber}
                  </span>
                ) : null}
              </div>

              <h1
                className="mt-1 break-words font-display font-semibold leading-tight"
                style={{ fontSize: "clamp(24px, 5.2vmin, 52px)" }}
              >
                {item.title}
              </h1>

              <p className="mt-1 text-sm text-on-ground-muted">
                {[item.who, item.played, item.pitch].filter(Boolean).join(" · ") || "—"}
              </p>
            </header>

            {/* ---- the faders ---- */}
            <div className="relative min-h-0 flex-1">
              <div ref={scroller} className="h-full overflow-y-auto px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-on-ground-muted">
                  {channels.length === 0
                    ? "No channels on this programme"
                    : `${openCount} of ${channels.length} open`}
                </p>

                {channels.length === 0 ? (
                  <p className="text-sm text-on-ground-muted">
                    Pick a desk on the programme page and the strips arrive here.
                  </p>
                ) : (
                  <>
                    {/*
                      A strip is a narrow tile, not a row.

                      Sailavan wanted at least twelve channels across at once,
                      and a twenty-channel desk read as a list of twenty full
                      names is a scroll, not a glance. 64px is what fits twelve
                      on a laptop and still holds three characters legibly; the
                      same auto-fill drops to four or five across on a phone
                      without a second layout to keep honest.
                    */}
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
                      {channels.map((c) => {
                        const isOpen = openIds.has(c.id);
                        const swapped = swaps.get(c.id) ?? null;
                        const who = occupantFor(c, { person: swapped });
                        /*
                         * THE CUSHION IS THE COLOUR, and only on a vocal strip.
                         *
                         * The cushions are fixed to channels — 1 is blue, 2 is
                         * grey — so the tile can be the cushion the person is
                         * holding, and the desk matches screen to hand without
                         * reading a word. An instrument strip has no cushion,
                         * so colouring it would invent one.
                         */
                        const cushion =
                          c.kind === "vocal" && c.colour ? micColourDot(c.colour) : null;

                        const label = [
                          `Channel ${c.number}`,
                          who,
                          c.kind === "vocal" && c.colour
                            ? `${micColourLabel(c.colour)} cushion`
                            : null,
                          c.mic,
                          swapped ? "for this item only" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");

                        return (
                          <li key={c.id}>
                            <span
                              title={`${label} — ${isOpen ? "open" : "closed"}`}
                              className={[
                                "flex h-full flex-col items-stretch overflow-hidden rounded-[8px] border",
                                isOpen
                                  ? "border-on-ground/25"
                                  : "border-rule opacity-40 grayscale",
                              ].join(" ")}
                            >
                              {/* The number on top, always legible: it is what
                                  the fader is labelled and how the strip is
                                  named out loud. */}
                              <span
                                aria-hidden
                                className={[
                                  "block border-b px-1 py-0.5 text-center font-mono text-[11px] font-bold leading-none",
                                  isOpen
                                    ? "border-on-ground/20 bg-surface/60 text-on-ground"
                                    : "border-rule text-on-ground-muted",
                                ].join(" ")}
                              >
                                {c.number}
                              </span>

                              <span
                                aria-hidden
                                className={[
                                  "flex min-h-[34px] flex-1 flex-col items-center justify-center px-0.5 py-1 text-center",
                                  cushion
                                    ? ""
                                    : isOpen
                                      ? "bg-brass/25"
                                      : "bg-transparent",
                                ].join(" ")}
                                style={
                                  cushion
                                    ? {
                                        // Full cushion colour when the fader is
                                        // up; a wash of it when it is down, so a
                                        // closed strip still says which cushion
                                        // it is without competing for attention.
                                        background: isOpen ? cushion : `${cushion}33`,
                                        color: isOpen ? "#fff" : undefined,
                                      }
                                    : undefined
                                }
                              >
                                <span className="block w-full truncate text-[13px] font-bold leading-none">
                                  {shortName(who) || "—"}
                                </span>
                                {c.mic ? (
                                  <span className="mt-0.5 block w-full truncate text-[9px] leading-none opacity-80">
                                    {c.mic}
                                  </span>
                                ) : null}
                              </span>

                              {/*
                                Colour is never the only carrier. A dark hall
                                and a colour-blind operator are both ordinary,
                                so open/closed is also brightness, also
                                greyscale, and also said in words here.
                              */}
                              <span className="sr-only">
                                {`${label} — ${isOpen ? "open" : "closed"}`}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    {/*
                      The tiles are three letters wide, which is enough to find
                      a fader and not enough to be sure whose it is. This line
                      spells the open ones out, so the channel number and the
                      person can always be tied together on the same screen.
                    */}
                    {openCount > 0 ? (
                      <p className="mt-3 text-xs leading-relaxed text-on-ground-muted">
                        {channels
                          .filter((c) => openIds.has(c.id))
                          .map((c) => {
                            const who = occupantFor(c, { person: swaps.get(c.id) ?? null });
                            return `${c.number} ${who ?? c.label}`;
                          })
                          .join("  ·  ")}
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              {more ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-2 right-3 rounded-full border border-rule bg-surface/90 px-2 py-0.5 text-sm text-on-surface-muted"
                >
                  ↓
                </span>
              ) : null}
            </div>

            {/* ---- moving on ---- */}
            <footer className="flex shrink-0 items-center gap-2 border-t border-rule px-4 py-3">
              <button
                type="button"
                disabled={back === null || pending}
                onClick={() => go(back)}
                /* Big targets: this is pressed in the dark, in a hurry, by
                   somebody not looking directly at it. */
                className="h-12 flex-1 rounded-[10px] border border-rule bg-surface text-base font-semibold disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={on === null || pending}
                onClick={() => go(on)}
                className="h-12 flex-[2] rounded-[10px] border border-brass-ink/80 bg-brass-ink text-base font-semibold text-ivory disabled:opacity-40"
              >
                Next →
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
