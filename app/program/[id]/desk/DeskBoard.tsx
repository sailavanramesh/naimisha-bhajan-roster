"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useSessionVersion } from "@/components/useSessionVersion";
import { currentItemOf, occupantFor, stepItem } from "@/lib/deskChannels";
import { type MicColourValue } from "@/lib/micCushion";
import { DeskStrips } from "@/components/DeskStrips";
import { Verses, type VerseView } from "@/components/Verses";
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
  /** Is this programme running the strip as a stereo pair? */
  stereo: boolean;
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
  bpm: number | null;
  arrangement: string | null;
  notes: string | null;
  /** The song's words, for the words pane. Empty when it is not catalogued. */
  verses: VerseView[];
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
   * Which pane this DEVICE is looking at. Not shared, unlike the item: the
   * person on the desk wants faders at the moment the singer beside them wants
   * the words, and making them agree would make the shared item useless.
   */
  const [pane, setPane] = useState<"all" | "words">("all");


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
  /*
   * Bring the song the room is on back into view.
   *
   * "All songs" is a long page and reading ahead down it is the point — but
   * having scrolled to song 9, pressing Next used to move the programme to song
   * 4 and leave the screen looking at 9, so the one row that had just become
   * true was the one you could not see. Sailavan asked for it to follow.
   *
   * `block: "nearest"` moves the least that puts it on screen, and nothing at
   * all when it is already there — so browsing near the current song does not
   * fight the finger.
   */
  const songRows = useRef(new Map<number, HTMLLIElement | null>());
  useEffect(() => {
    if (pane !== "all") return;
    const row = songRows.current.get(position ?? -1) ?? null;
    if (!row) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [position, pane]);

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


  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] overflow-hidden overscroll-none bg-ground text-on-ground">
      {/* The date down the edge, as on the bhajan board: it must stay on screen
          and it should not spend a line of height doing so. */}
      <aside className="flex w-9 shrink-0 flex-col items-center justify-between border-r border-rule bg-surface/50 py-3">
        <Link
          href={`/program/${sessionId}`}
          aria-label="Exit the live view"
          title="Exit the live view"
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

            {/*
              THE RUNNING ORDER, ACROSS THE TOP.

              Sailavan: "allow multiple songs to show up on the screen, allowing
              them to highlight a certain song if they want and then go across to
              words." One item at a time answers "what now"; it does not answer
              "what is coming", which is the question between songs — and both
              panes below follow whichever is picked, so highlighting a song and
              going across to Words shows that song's words.

              Tapping one MOVES THE ROOM, exactly as Next does. The item is
              shared on purpose: the whole point of this screen is that the desk,
              the stage and anybody watching are on the same one, and a second
              private notion of "current" would undo that quietly.
            */}
            {items.length > 1 ? (
              <div className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-2">
                {items.map((it) => {
                  const here = it.position === item.position;
                  return (
                    <button
                      key={it.position}
                      type="button"
                      aria-pressed={here}
                      disabled={pending}
                      onClick={() => go(it.position)}
                      className={[
                        "shrink-0 rounded-key border px-2 py-1 text-left text-xs",
                        here
                          ? "border-brass-ink/70 bg-brass-ink text-ivory"
                          : "border-rule text-on-ground-muted hover:border-brass/50",
                      ].join(" ")}
                    >
                      <span className="font-mono">
                        {it.kind === "narration" ? "read" : it.songNumber}
                      </span>
                      <span className="ms-1.5 max-w-[10rem] truncate align-middle">{it.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/*
              DESK, OR WORDS.

              Sailavan: "there should be a desk view and a song view for each
              song... toggle to desk view to know what to change on the mic."
              Both are about the SAME item — the one the room is on — so this is
              two ways of looking at one thing rather than two screens, and Next
              moves both at once for everybody.

              The choice is per DEVICE and deliberately not shared: the person on
              the desk wants faders while the singer beside them wants the words,
              and forcing them to agree would make the shared item useless.
            */}
            <div className="flex shrink-0 gap-1 border-b border-rule px-4 pb-2">
              {(
                [
                  /*
                    Two panes, not three. The single-item desk went: with the
                    running order across the top marking where the room is, it
                    said the same thing as one row of "All songs" and cost a tab
                    to reach. Sailavan: "just all songs and words is enough with
                    the songs individually listed out above them as they are now."
                  */
                  { key: "all", label: "All songs" },
                  { key: "words", label: "Words" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={pane === t.key}
                  onClick={() => setPane(t.key)}
                  className={[
                    "rounded-key border px-3 py-1 text-sm font-semibold",
                    pane === t.key
                      ? "border-brass-ink/70 bg-brass-ink text-ivory"
                      : "border-rule text-on-ground-muted",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              ))}
              {item.verses.length === 0 && pane === "words" ? (
                <span className="self-center ps-2 text-xs text-on-ground-muted">
                  no words recorded for this item
                </span>
              ) : null}
            </div>

            {/* ---- every song at once ---- */}
            {pane === "all" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {/*
                  Sailavan: "add an option to see all the songs' desk view in the
                  one screen... mostly used by the mic person, or people who are
                  watching the transition of mics."

                  That is a different question from "what now": it is "what
                  changes between these two", and it cannot be answered by a view
                  that shows one item. The same drawn desk, once per song, so the
                  difference between two rows IS the handover.

                  Read-only on purpose. This is the screen somebody watches from
                  the side of the hall, and the item everybody is on is moved by
                  the header above — tapping a song's name here still moves it,
                  because that is what tapping a song means everywhere else on
                  this screen.
                */}
                <ul className="grid gap-4">
                  {items.map((it) => {
                    const here = it.position === item.position;
                    const open = new Set(it.openChannelIds);
                    const swapped = new Map(it.swaps.map((sw) => [sw.channelId, sw.who]));

                    return (
                      <li
                        key={it.position}
                        ref={(el) => {
                          songRows.current.set(it.position, el);
                        }}
                        /*
                          THE SONG THE ROOM IS ON, ringed in brass.
                          
                          The same mark an open strip carries, for the same
                          reason: on this screen brass means "this one, now".
                          Sailavan asked for it here because the all-songs view
                          is read from across a hall, where a bolder number and
                          a heavier title are not enough to find your place.
                        */
                        className={[
                          "grid gap-1.5 rounded-[12px] px-2 py-2",
                          here ? "bg-brass/[0.06] ring-2 ring-brass/70" : "",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => go(it.position)}
                          className="flex flex-wrap items-baseline gap-2 text-left"
                        >
                          <span
                            className={[
                              "rounded-key px-1.5 py-0.5 font-mono text-[11px] font-bold",
                              here ? "bg-brass-ink text-ivory" : "text-on-ground-muted",
                            ].join(" ")}
                          >
                            {it.kind === "narration" ? "read" : it.songNumber}
                          </span>
                          <span className={here ? "font-semibold" : ""}>{it.title}</span>
                          <span className="text-xs text-on-ground-muted">
                            {open.size} of {channels.length} open
                            {it.sceneNumber !== null ? ` · scene ${it.sceneNumber}` : ""}
                            {here ? " · now" : ""}
                          </span>
                        </button>

                        <DeskStrips
                          dense
                          strips={channels.map((c) => ({
                            ...c,
                            who: occupantFor(c, { person: swapped.get(c.id) ?? null }),
                          }))}
                          openIds={open}
                          swappedIds={new Set(swapped.keys())}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* ---- the words ---- */}
            {pane === "words" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {/*
                  The same Verses component the song page and the programme use,
                  so the line-by-line alignment — and the toggles for showing
                  script, transliteration and meaning separately — are one
                  implementation. Sailavan asked for "the nice option to toggle
                  each one on or off"; it is already that component's own.
                */}
                <Verses verses={item.verses} />

                {/*
                  The working notes, under the words, because they are read in
                  the same breath: what shruti, how fast, and whatever was
                  agreed about the arrangement.
                */}
                {item.pitch || item.bpm || item.arrangement || item.notes ? (
                  <dl className="mt-4 grid gap-1 border-t border-rule pt-3 text-sm">
                    {item.pitch ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-on-ground-muted">Shruti</dt>
                        <dd className="font-semibold">{item.pitch}</dd>
                      </div>
                    ) : null}
                    {item.bpm ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-on-ground-muted">Tempo</dt>
                        <dd>{item.bpm} bpm</dd>
                      </div>
                    ) : null}
                    {item.arrangement ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-on-ground-muted">Arrangement</dt>
                        <dd className="whitespace-pre-wrap">{item.arrangement}</dd>
                      </div>
                    ) : null}
                    {item.notes ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-on-ground-muted">Notes</dt>
                        <dd className="whitespace-pre-wrap">{item.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </div>
            ) : null}

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
