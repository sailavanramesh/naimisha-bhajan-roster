"use client";

import { useState, useTransition } from "react";
import { Button, Card, CardContent, Input } from "@/components/ui";
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

export type EditorItem = {
  id: string;
  position: number;
  kind: "song" | "narration";
  title: string;
  narration: string;
  pitchNote: string;
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

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate font-display text-lg font-semibold">
              {heading}
              {draft.pitchNote ? (
                <span className="ml-2 font-mono text-sm font-normal text-on-surface-muted">
                  {draft.pitchNote}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-sm text-on-surface-muted">
              {[performers, played].filter(Boolean).join(" · ") ||
                (isReading ? "no reader yet" : "nobody yet")}
            </span>
          </button>

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
              <label className="grid gap-1 text-xs text-on-surface-muted">
                {isReading ? "What it is called" : "Song"}
                <Input
                  value={draft.title}
                  disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={isReading ? "e.g. Opening words" : "e.g. Guru Meri Pooja"}
                />
              </label>

              {!isReading ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-on-surface-muted">
                    Pitch
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
                  <label className="grid gap-1 text-xs text-on-surface-muted">
                    Beats per minute
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
            </div>

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
