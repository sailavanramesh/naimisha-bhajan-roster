"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Card, CardContent, Input } from "@/components/ui";
import { ShrutiPlayer } from "@/components/ShrutiPlayer";
import { TrackControl, InlineTrack } from "@/components/TrackControl";
import { PracticePlayer } from "@/components/PracticePlayer";
import type { ResolvedTracks } from "@/lib/songTracks";
import { NOTE_NAMES } from "@/lib/pitch";
import { instrumentsLabel, performersLabel, runningOrderLabel, songNumbers } from "@/lib/program";
import {
  addItemInstrument,
  addPerformer,
  addProgramItem,
  moveProgramItem,
  removeItemInstrument,
  removePerformer,
  removeProgramItem,
  updateProgramItem,
} from "./actions";
import { createSong, renameSong, setItemSong } from "@/app/songs/actions";
import { Verses, type VerseView } from "@/components/Verses";
import { VerseEditor } from "@/components/VerseEditor";

export type EditorItem = {
  id: string;
  position: number;
  kind: "song" | "narration";
  /** The catalogue entry, when this item has one. Null while it is a bare title. */
  songId: string | null;
  songTitle: string | null;
  /** Its words, so they can be read and edited here rather than two hops away. */
  verses: VerseView[];
  title: string;
  narration: string;
  pitchNote: string;
  /** The audio uploaded ON THIS ITEM, if somebody has added one. */
  track: {
    file: string | null;
    name: string | null;
    bytes: number | null;
    uploadedBy: string | null;
  };
  /**
   * What this item should actually play: its own track, or the catalogued song's
   * practice pair when it has none. Resolved on the server by
   * lib/songTracks.ts, so the running order, the desk and the song page all give
   * the same answer.
   */
  plays: ResolvedTracks;
  bpm: string;
  referenceUrl: string;
  arrangement: string;
  notes: string;
  performers: {
    id: string;
    singerName: string | null;
    name: string | null;
    part: string | null;
  }[];
  instruments: {
    id: string;
    instrumentName: string;
    singerName: string | null;
    person: string | null;
  }[];
};

/**
 * The running order.
 *
 * Collapsed by default, one line each — a built program is read far more often
 * than it is edited, and eleven items with every field open is a page nobody
 * can see the shape of. Opening one shows everything about it.
 *
 * The number on a song is NOT its position: readings sit in the same list and
 * carry no number, so that dropping one in does not renumber the songs after
 * it. See lib/program.ts `songNumbers`.
 */
export function ProgramEditor({
  sessionId,
  items,
  singers,
  instruments,
  canEdit,
}: {
  sessionId: string;
  items: EditorItem[];
  singers: { id: string; name: string }[];
  instruments: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const numbers = songNumbers(items);

  const add = (kind: "song" | "narration") =>
    startTransition(async () => {
      setError(null);
      const res = await addProgramItem({ sessionId, kind });
      if (!res.ok) setError(res.error);
    });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Running order</h2>
        <p className="text-sm text-on-surface-muted">{runningOrderLabel(items)}</p>
      </div>

      {/*
        The list is laid out on minmax(0,1fr) tracks, here and inside each card,
        and the rows carry min-w-0.

        A grid track sizes to its content unless told otherwise — `min-width:
        auto` on a grid item — so a long bhajan title pushed the card, and with
        it the whole page, to 672px inside a 390px phone. Every `truncate` below
        is powerless against that: the text never gets the chance to overflow
        its box, because the box grows instead.
      */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-on-surface-muted">
            Nothing in the program yet.
          </CardContent>
        </Card>
      ) : (
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {items.map((item, index) => (
            <li key={item.id} className="min-w-0">
              <ItemCard
                item={item}
                number={numbers.get(item.position) ?? null}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                singers={singers}
                instruments={instruments}
                canEdit={canEdit}
                isOpen={open === item.id}
                onToggle={() => setOpen(open === item.id ? null : item.id)}
                onError={setError}
              />
            </li>
          ))}
        </ol>
      )}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" disabled={pending} onClick={() => add("song")}>
            Add a song
          </Button>
          <Button type="button" disabled={pending} onClick={() => add("narration")}>
            Add a reading
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="status" className="text-xs text-warn">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ItemCard({
  item,
  number,
  isFirst,
  isLast,
  singers,
  instruments,
  canEdit,
  isOpen,
  onToggle,
  onError,
}: {
  item: EditorItem;
  number: number | null;
  isFirst: boolean;
  isLast: boolean;
  singers: { id: string; name: string }[];
  instruments: { id: string; name: string }[];
  canEdit: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState(item);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const isReading = item.kind === "narration";

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      onError(null);
      const res = await work();
      if (!res.ok) onError(res.error ?? "That did not save.");
    });

  const save = () =>
    startTransition(async () => {
      onError(null);
      const res = await updateProgramItem({
        id: item.id,
        title: draft.title,
        narration: draft.narration,
        pitchNote: draft.pitchNote,
        bpm: draft.bpm,
        referenceUrl: draft.referenceUrl,
        arrangement: draft.arrangement,
        notes: draft.notes,
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else onError(res.error);
    });

  const heading = isReading
    ? draft.title.trim() || "Reading"
    : draft.title.trim() || "Not chosen yet";

  const performers = performersLabel(item.performers);
  const played = instrumentsLabel(item.instruments);

  return (
    <Card>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-2 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-mono text-xs ${
              isReading
                ? "border border-dashed border-rule-surface text-on-surface-muted"
                : "bg-field text-on-surface"
            }`}
          >
            {isReading ? "read" : number}
          </span>

          {/*
            THE TITLE, THE KEY, THE TRACK — three siblings, not one nested pile.

            Two bugs came out of the old shape, which put the tanpura button and
            the whole inline player INSIDE the button that opens the item.

            One: a phone in portrait had no room for all of it, and since the
            title was the only shrinkable thing on the line, it was the thing
            that shrank — to nothing. Sailavan, 2026-08-21: "if a track is added
            to a song, it cuts out the title", and the screenshot shows item 3
            with no title at all, the Words button sitting on top of the elapsed
            time. So under `sm` the track drops onto its own line (`basis-full`),
            which is the width it wants anyway, and the title keeps the first.

            Two: `<button>` may not contain a button, and the HTML PARSER does
            not merely disapprove — it closes the outer one. So the markup the
            server sent and the tree React built in the browser disagreed on
            every item with a pitch or a track, which is hydration error #418 on
            this page. React then threw away the server's HTML and re-rendered
            the lot on the client, which is the slowest possible way to draw a
            running order.

            THE KEY STILL NEVER TRUNCATES. The title does — `shrink-0` on the
            key, `min-w-0 truncate` on the title, so the ellipsis lands in the
            long name rather than eating the note somebody is scanning for.
          */}
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              /* Not flex-1: the key and the player sit right beside the name,
                 as they did before, rather than being pushed out to the far
                 edge of a wide screen. It still shrinks — flex items do by
                 default — which is what keeps a long title in bounds. */
              className="flex min-w-0 items-baseline gap-2 text-left font-display text-lg font-semibold"
            >
              {/*
                Two lines on a phone, one from `sm` up.

                Truncating at a phone's width left "Kuzhalooti manam…" and
                "Kandu Njaan Kann…" — the ellipsis falls in the middle of the
                name, and several bhajans in a set can share a first word. There
                is room for a second line and no reason to hoard it; the wider
                layout has never needed one.
              */}
              <span className="min-w-0 leading-snug line-clamp-2 sm:line-clamp-1">{heading}</span>
            </button>

            {/*
              The key and the button that sounds it, as one thing.

              The player has to be outside the toggle — a button inside a button
              is what broke this markup in the first place — but the two must not
              be allowed to separate: with the name wrapping onto a second line
              on a phone, the tanpura circle went and sat by itself on a third,
              reading as a stray control belonging to nothing.
            */}
            {draft.pitchNote ? (
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm text-on-surface-muted">
                {draft.pitchNote}
                <ShrutiPlayer label={draft.pitchNote} />
              </span>
            ) : null}

            {/* The recording, playable without opening the item — the running
                order is read on the night, and opening each song to reach its
                track is a hop nobody wants mid-programme. Its own line on a
                phone, beside the title from `sm` up. */}
            {draft.plays.play ? (
              <span className="basis-full sm:basis-auto">
                <InlineTrack file={draft.plays.play.file} name={draft.plays.play.name} />
              </span>
            ) : null}

            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              aria-label={`Open ${heading}`}
              className="block min-w-0 basis-full truncate text-left text-sm text-on-surface-muted"
            >
              {[performers, played].filter(Boolean).join(" · ") ||
                (isReading ? "no reader yet" : "nobody yet")}
            </button>
          </div>

          {/*
            Straight to the words. Sailavan: "have a link next to each song to
            the song's lyrics and meanings". The card opens to an editor, which
            is not what somebody wanting to read the song is after — and it is
            not offered to editors only, because reading is what most people
            come to a running order for.
          */}
          {!isReading && item.songId ? (
            <Link
              href={`/songs/${item.songId}`}
              title="Words and meaning"
              className="shrink-0 rounded-key border border-rule-surface px-2 py-1 text-xs text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
            >
              Words
            </Link>
          ) : null}

          {canEdit ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Move up"
                disabled={pending || isFirst}
                className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
                onClick={() => run(() => moveProgramItem({ id: item.id, direction: "up" }))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={pending || isLast}
                className="rounded border border-rule-surface px-1.5 text-xs text-on-surface-muted hover:text-on-surface disabled:opacity-30"
                onClick={() => run(() => moveProgramItem({ id: item.id, direction: "down" }))}
              >
                ↓
              </button>
            </span>
          ) : null}
        </div>

        {isOpen ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-rule-surface pt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid content-start gap-1 text-xs text-on-surface-muted">
                {/*
                  TWO THINGS KEEP THESE FIELDS IN LINE. Sailavan, 2026-08-21:
                  "the alignment is wonky here".

                  1. Every label's first line is a fixed 24px — the height of the
                     ShrutiPlayer the Pitch label carries so a note can be
                     auditioned while it is chosen. A 24px button on a 16px line
                     of text made that one label row taller than its neighbours
                     and pushed its field down. Sizing the button to the text
                     would fix this case and leave the next label that needs a
                     control to break it again.

                  2. `content-start` on each label. These are grids, and the
                     Song column is TALLER than the others — it carries a hint
                     and the "Words and meaning" links. Grid stretches its items,
                     so the two-row labels beside it were stretched to match and
                     `align-content: normal` shared the slack out among their
                     rows: measured on production, a 24px label row had become
                     43px and the field sat 19px low. Pinning the content to the
                     top means a label's rows keep the size they asked for
                     however tall the row around them is.
                */}
                <span className="flex h-6 items-center">
                  {isReading ? "What it is called" : "Song"}
                </span>
                {/*
                  ONCE A SONG IS CATALOGUED, ITS NAME LIVES THERE.

                  ProgramItem.title is documented as the name to use "for an item
                  whose song is not catalogued yet" — so while a song IS linked,
                  editing that field changes something nothing displays. Sailavan
                  renamed an item to "Paasuram" and every screen kept saying
                  "Guru Meri Pooja", because they all read `song.title ??
                  item.title` and the song still said the old name.

                  So a linked item renames the CATALOGUE ENTRY, which is the
                  thing everybody reads, and says that is what it is doing.
                */}
                {!isReading && item.songId ? (
                  <SongTitle
                    songId={item.songId}
                    title={item.songTitle ?? ""}
                    canEdit={canEdit}
                    onError={onError}
                  />
                ) : (
                  <Input
                    value={draft.title}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder={isReading ? "e.g. Opening words" : "e.g. Guru Meri Pooja"}
                  />
                )}
                {!isReading ? <SongLink item={item} canEdit={canEdit} onError={onError} /> : null}

              </label>

              {!isReading ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid content-start gap-1 text-xs text-on-surface-muted">
                    <span className="flex h-6 items-center gap-1.5">
                      Pitch
                      {/* Audition while choosing, rather than saving first. */}
                      <ShrutiPlayer label={draft.pitchNote} />
                    </span>
                    <select
                      value={draft.pitchNote}
                      disabled={!canEdit}
                      className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
                      onChange={(e) => setDraft({ ...draft, pitchNote: e.target.value })}
                    >
                      <option value="">—</option>
                      {NOTE_NAMES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid content-start gap-1 text-xs text-on-surface-muted">
                    <span className="flex h-6 items-center">Beats per minute</span>
                    <Input
                      value={draft.bpm}
                      inputMode="numeric"
                      disabled={!canEdit}
                      onChange={(e) => setDraft({ ...draft, bpm: e.target.value })}
                      placeholder="e.g. 70"
                    />
                  </label>
                </div>
              ) : null}

              {/*
                THE TRACK.

                Sailavan: "there should be an option to upload a track to the
                song so it can be played from the running order section, can
                scrub through the track to whatever time point".

                Only on a song — a narration has nothing to play. Outside the
                `!isReading` block above, because listening is not editing: a
                singer reading the running order on the night is exactly who
                needs to hear it, and they may not have edit rights.
              */}
              {draft.kind === "song" ? (
                <div className="mt-2 grid gap-1">
                  <span className="text-xs text-on-surface-muted">Track</span>

                  {/*
                    A practice pair, when what is being played has one: both
                    halves in sync with a switch that drops the voice in and out.
                    Usually the catalogued song's, which is the point of putting
                    it there — upload once and every programme gets it.
                  */}
                  {draft.plays.canToggle && draft.plays.play && draft.plays.karaoke ? (
                    <>
                      <PracticePlayer
                        original={{ file: draft.plays.play.file, name: draft.plays.play.name }}
                        karaoke={{ file: draft.plays.karaoke.file, name: draft.plays.karaoke.name }}
                      />
                      <span className="text-[11px] text-on-surface-muted">
                        {draft.plays.source === "song"
                          ? "From the song catalogue. Adding a track here instead would override it for this programme."
                          : "Uploaded on this item."}
                      </span>
                    </>
                  ) : draft.plays.play && draft.plays.source === "song" ? (
                    <>
                      <audio
                        controls
                        preload="metadata"
                        className="h-9 w-full"
                        src={`/api/tracks/${draft.plays.play.file}`}
                      >
                        Your browser cannot play audio.
                      </audio>
                      <span className="text-[11px] text-on-surface-muted">
                        From the song catalogue. Adding a track here instead would override it for
                        this programme.
                      </span>
                    </>
                  ) : null}

                  <TrackControl
                    endpoint={`/api/program/item/${draft.id}/track`}
                    initial={draft.track}
                    canEdit={canEdit}
                    addLabel={
                      draft.plays.source === "song"
                        ? "Use a different track for this programme"
                        : "Add a track"
                    }
                    playerHidden={Boolean(draft.plays.canToggle && draft.track.file)}
                  />
                </div>
              ) : null}
            </div>

              {/*
                THE WORDS, ON THE ITEM.

                Sailavan: "in each individual song, I can't see a section for
                the song's lyrics and meanings and ascribing it line by line."
                They existed — in the song catalogue, behind a link, and only
                once somebody had thought to add the song to that catalogue
                first. Two hops and a prerequisite, for the thing a singer most
                wants to look at.

                So they are here, collapsed, and the section itself is what
                offers to create the catalogue entry when there is not one yet.
                Same components as the song page — read and edit — so the line
                by line alignment of script, transliteration and meaning is
                literally the same code, not a second version of it.
              */}
              {!isReading && item.songId ? (
                <details className="rounded-[10px] border border-rule-surface">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold">
                    Words and meaning
                    <span className="ms-2 font-normal text-on-surface-muted">
                      {item.verses.length === 0
                        ? "none yet"
                        : `${item.verses.length} verse${item.verses.length === 1 ? "" : "s"}`}
                    </span>
                  </summary>
                  <div className="grid gap-3 px-3 pb-3">
                    <Verses verses={item.verses} />
                    <VerseEditor songId={item.songId} verses={item.verses} canEdit={canEdit} />
                  </div>
                </details>
              ) : null}

            {isReading ? (
              <label className="grid gap-1 text-xs text-on-surface-muted">
                The passage
                <textarea
                  value={draft.narration}
                  disabled={!canEdit}
                  rows={6}
                  onChange={(e) => setDraft({ ...draft, narration: e.target.value })}
                  className="rounded-key border border-rule-surface bg-field p-2 font-display text-sm leading-relaxed text-on-surface"
                  placeholder="What is read out between the songs."
                />
              </label>
            ) : (
              <>
                <label className="grid gap-1 text-xs text-on-surface-muted">
                  Recording to learn from
                  <Input
                    value={draft.referenceUrl}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, referenceUrl: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                </label>
                <label className="grid gap-1 text-xs text-on-surface-muted">
                  Arrangement — the working notes beside the piece
                  <textarea
                    value={draft.arrangement}
                    disabled={!canEdit}
                    rows={3}
                    onChange={(e) => setDraft({ ...draft, arrangement: e.target.value })}
                    className="rounded-key border border-rule-surface bg-field p-2 text-sm text-on-surface"
                    placeholder="e.g. Tenor split off x1, bass rejoin x1"
                  />
                </label>
              </>
            )}

            <label className="grid gap-1 text-xs text-on-surface-muted">
              Notes
              <Input
                value={draft.notes}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>

            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="primary" className="h-9" disabled={pending} onClick={save}>
                  Save
                </Button>
                {saved ? <span className="text-xs text-brass-ink">Saved.</span> : null}
                <Button
                  type="button"
                  variant="danger"
                  className="ml-auto h-9 text-xs"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Remove "${heading}" from the program?`)) return;
                    run(() => removeProgramItem({ id: item.id }));
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : null}

            <People item={item} singers={singers} canEdit={canEdit} isReading={isReading} onError={onError} />

            {!isReading ? (
              <Instruments item={item} instruments={instruments} singers={singers} canEdit={canEdit} onError={onError} />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The catalogue entry behind this item, where the words live.
 *
 * An item can sit in a program with only a title — that is how one starts, and
 * a half-built program should not demand a catalogue entry before it will hold
 * a name. Linking one is what gives the item lyrics, meanings, and a place that
 * remembers every other time the group has sung it.
 *
 * Creating from here rather than sending somebody to /songs first: they are
 * building a running order, and the song they have just typed is obviously the
 * one they mean.
 */
function SongLink({
  item,
  canEdit,
  onError,
}: {
  item: EditorItem;
  canEdit: boolean;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  if (item.songId) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <Link
          href={`/songs/${item.songId}`}
          className="text-brass-ink underline underline-offset-2"
        >
          Words and meaning →
        </Link>
        {canEdit ? (
          <button
            type="button"
            disabled={pending}
            className="text-on-surface-muted underline underline-offset-2 hover:text-warn"
            onClick={() =>
              startTransition(async () => {
                const res = await setItemSong({ itemId: item.id, songId: "" });
                if (!res.ok) onError(res.error);
              })
            }
          >
            unlink
          </button>
        ) : null}
      </span>
    );
  }

  if (!canEdit) return null;

  return (
    <button
      type="button"
      disabled={pending || item.title.trim().length === 0}
      className="justify-self-start text-xs text-on-surface-muted underline underline-offset-2 hover:text-on-surface disabled:opacity-40"
      onClick={() =>
        startTransition(async () => {
          onError(null);
          // Same title, same song: createSong hands back the existing one
          // rather than refusing, so two people doing this at once converge.
          const created = await createSong({ title: item.title });
          if (!created.ok) {
            onError(created.error);
            return;
          }
          const linked = await setItemSong({ itemId: item.id, songId: created.id });
          if (!linked.ok) onError(linked.error);
        })
      }
    >
      {item.title.trim().length === 0
        ? "Name the song to add its words"
        : "Add this to the song catalogue, with its words"}
    </button>
  );
}

/**
 * Who sings it, or who reads it.
 *
 * A roster singer OR a typed name, side by side and equally weighted — half the
 * performers in the group's own documents are guests and groups (Psais, All
 * girls, Radhika aunty), and making those the awkward path would be modelling
 * the wrong thing.
 */
function People({
  item,
  singers,
  canEdit,
  isReading,
  onError,
}: {
  item: EditorItem;
  singers: { id: string; name: string }[];
  canEdit: boolean;
  isReading: boolean;
  onError: (message: string | null) => void;
}) {
  const [singerId, setSingerId] = useState("");
  const [name, setName] = useState("");
  const [part, setPart] = useState(isReading ? "reader" : "");
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      onError(null);
      const res = await addPerformer({ itemId: item.id, singerId, name, part });
      if (res.ok) {
        setSingerId("");
        setName("");
        setPart(isReading ? "reader" : "");
      } else onError(res.error);
    });

  return (
    <div className="grid gap-1.5">
      <p className="text-xs uppercase tracking-wide text-on-surface-muted">
        {isReading ? "Reader" : "Singers"}
      </p>

      {item.performers.length === 0 ? (
        <p className="text-sm text-on-surface-muted">Nobody yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {item.performers.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full border border-rule-surface bg-field px-3 py-1 text-sm"
            >
              <span>
                {p.singerName ?? p.name}
                {p.part ? (
                  <span className="ml-1 text-xs text-on-surface-muted">({p.part})</span>
                ) : null}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove ${p.singerName ?? p.name}`}
                  className="text-on-surface-muted hover:text-warn"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await removePerformer({ id: p.id });
                      if (!res.ok) onError(res.error);
                    })
                  }
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={singerId}
            aria-label="Add a singer"
            className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
            onChange={(e) => {
              setSingerId(e.target.value);
              if (e.target.value) setName("");
            }}
          >
            <option value="">From the roster…</option>
            {singers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-on-surface-muted">or</span>
          <Input
            value={name}
            aria-label="Or type a name"
            placeholder="a guest or a group"
            className="h-9 w-44"
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value) setSingerId("");
            }}
          />
          <Input
            value={part}
            aria-label="Part"
            placeholder="part, e.g. tenor"
            className="h-9 w-36"
            onChange={(e) => setPart(e.target.value)}
          />
          <Button
            type="button"
            className="h-9"
            disabled={pending || (!singerId && name.trim().length === 0)}
            onClick={add}
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** What plays on it, from the managed list. */
function Instruments({
  item,
  instruments,
  singers,
  canEdit,
  onError,
}: {
  item: EditorItem;
  instruments: { id: string; name: string }[];
  singers: { id: string; name: string }[];
  canEdit: boolean;
  onError: (message: string | null) => void;
}) {
  const [instrumentId, setInstrumentId] = useState("");
  const [singerId, setSingerId] = useState("");
  const [person, setPerson] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      onError(null);
      const res = await addItemInstrument({ itemId: item.id, instrumentId, singerId, person });
      if (res.ok) {
        setInstrumentId("");
        setSingerId("");
        setPerson("");
      } else onError(res.error);
    });

  return (
    <div className="grid gap-1.5">
      <p className="text-xs uppercase tracking-wide text-on-surface-muted">Instruments</p>

      {item.instruments.length === 0 ? (
        <p className="text-sm text-on-surface-muted">None yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {item.instruments.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-2 rounded-full border border-rule-surface bg-field px-3 py-1 text-sm"
            >
              <span>
                {i.instrumentName}
                {i.singerName ?? i.person ? (
                  <span className="ml-1 text-xs text-on-surface-muted">
                    ({i.singerName ?? i.person})
                  </span>
                ) : null}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove ${i.instrumentName}`}
                  className="text-on-surface-muted hover:text-warn"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await removeItemInstrument({ id: i.id });
                      if (!res.ok) onError(res.error);
                    })
                  }
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={instrumentId}
            aria-label="Instrument"
            className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
            onChange={(e) => setInstrumentId(e.target.value)}
          >
            <option value="">Instrument…</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select
            value={singerId}
            aria-label="Played by"
            className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
            onChange={(e) => {
              setSingerId(e.target.value);
              if (e.target.value) setPerson("");
            }}
          >
            <option value="">Played by…</option>
            {singers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Input
            value={person}
            aria-label="Or another player"
            placeholder="or a name"
            className="h-9 w-36"
            onChange={(e) => {
              setPerson(e.target.value);
              if (e.target.value) setSingerId("");
            }}
          />
          <Button type="button" className="h-9" disabled={pending || !instrumentId} onClick={add}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The name of a catalogued song, edited from the programme that sings it.
 *
 * Saves on blur rather than through the item's Save button, because it writes to
 * a different row than everything else on this form — the Song, which other
 * programmes share. Keeping it on its own write also keeps the item's save from
 * having to know about the catalogue.
 */
function SongTitle({
  songId,
  title,
  canEdit,
  onError,
}: {
  songId: string;
  title: string;
  canEdit: boolean;
  onError: (message: string | null) => void;
}) {
  const [value, setValue] = useState(title);
  const [pending, startTransition] = useTransition();

  return (
    <span className="grid gap-0.5">
      <Input
        value={value}
        disabled={!canEdit || pending}
        aria-label="Song name, in the catalogue"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const next = value.trim();
          if (next === title || next.length === 0) {
            setValue(title);
            return;
          }
          startTransition(async () => {
            const res = await renameSong({ songId, title: next });
            if (!res.ok) {
              onError(res.error);
              setValue(title);
            } else onError(null);
          });
        }}
      />
      <span className="text-[10px] text-on-surface-muted">
        Renames it in the song catalogue, for every programme that sings it.
      </span>
    </span>
  );
}
