"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useSessionVersion } from "@/components/useSessionVersion";
import { currentItemOf, stepItem } from "@/lib/deskChannels";
import { hasMoreBelow } from "@/lib/liveBoard";
import { setCurrentItem } from "../deskActions";

export type DeskChannel = {
  id: string;
  number: string;
  label: string;
  kind: string;
  /** Who or what is on the strip. Null on a spare. */
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
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                    {channels.map((c) => {
                      const isOpen = openIds.has(c.id);
                      return (
                        <li
                          key={c.id}
                          /*
                            Open is stated three ways — brightness, weight and
                            the word itself in the label read out to a screen
                            reader. A dark hall and a colour-blind operator are
                            both ordinary, and this is the one thing on screen
                            that must not be guessed at.
                          */
                          className={[
                            "flex items-center gap-2 rounded-[10px] border px-2 py-2",
                            isOpen
                              ? "border-brass/70 bg-brass/15 text-on-ground"
                              : "border-rule bg-surface/30 text-on-ground-muted opacity-55",
                          ].join(" ")}
                        >
                          <span
                            aria-hidden
                            className={[
                              "grid h-9 w-9 shrink-0 place-items-center rounded-[8px] font-mono text-base font-bold",
                              isOpen
                                ? "bg-brass text-ivory"
                                : "border border-rule bg-transparent",
                            ].join(" ")}
                          >
                            {c.number}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold leading-tight">
                              {c.label}
                            </span>
                            {c.who && c.who !== c.label ? (
                              <span className="block truncate text-xs leading-tight">{c.who}</span>
                            ) : null}
                          </span>
                          <span className="sr-only">
                            {`Channel ${c.number}, ${c.label}, ${isOpen ? "open" : "closed"}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
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
