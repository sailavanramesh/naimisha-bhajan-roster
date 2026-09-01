"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RepertoireKind } from "@prisma/client";
import { Button, Textarea, Badge } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { upsertLearning, removeLearning } from "@/app/my-list/actions";
import type { ListRow, PitchSource } from "@/lib/learningList";
import {
  applyListFilter,
  isFiltered,
  daysSince,
  disagrees,
  toggleValue,
  ANY_VALUES,
  EMPTY_FILTER,
  RECENT_DAYS,
  STALE_DAYS,
  type ListFilter,
  type ShrutiState,
  type SortKey,
  type SungState,
  type ValueFilter,
} from "@/lib/learningListFilter";
import { MultiFilter } from "@/components/MultiFilter";

/**
 * components/LearningListView.tsx — the list you can actually find things in.
 *
 * Replaces three stacked <details> accordions, one per stage, each opening onto
 * an unsearchable column of cards. Sailavan, 2026-09-01: "the layout and the way
 * to use it/access it is limited" — he liked every section and concept in it,
 * and could not get around it. With ninety-odd entries the old shape asked you
 * to remember which stage a bhajan was at before you could look for it, which is
 * backwards: the stage is usually the thing you have come to check.
 *
 * So: one flowing list, and the stages become filter chips over the top of it.
 * Search and every filter cut across all three at once.
 *
 * ALL OF IT RUNS IN THE BROWSER, on rows the server already sent. Same argument
 * as SungBhajanSearch next door: one person's list is at most a few hundred rows
 * and is already on the page, so a round trip per keystroke would be slower and
 * noisier for no benefit. lib/learningList.ts puts every field a filter asks
 * about — deity, raga, tempo, last sung, the suggested shruti — onto the row for
 * exactly this reason.
 *
 * `canEdit` is what separates reading somebody's list from keeping your own. The
 * controls are simply absent without it; the server decides again anyway, in
 * app/my-list/actions.ts, because hiding a button is not a permission.
 */

const STAGES: Array<{ kind: RepertoireKind; title: string; blurb: string }> = [
  {
    kind: RepertoireKind.wantToLearn,
    title: "Want to learn",
    blurb: "Caught your ear. Nothing started yet.",
  },
  {
    kind: RepertoireKind.learning,
    title: "Learning",
    blurb: "Working on it. Notes and a shruti help here.",
  },
  {
    kind: RepertoireKind.known,
    title: "Know it",
    blurb: "Confident enough to sing. These count in the session builder.",
  },
];

const STAGE_TITLE: Record<RepertoireKind, string> = {
  [RepertoireKind.wantToLearn]: "Want to learn",
  [RepertoireKind.learning]: "Learning",
  [RepertoireKind.known]: "Know it",
  // Not a stage on this list, but RepertoireKind carries it; see the schema.
  [RepertoireKind.festival]: "Festival",
};

/**
 * Where a suggested shruti came from, in the singer's own terms.
 *
 * Deliberately NOT the same words as a saved shruti. Sailavan: the saved value
 * "should say something different to predicted or recommended pitch to highlight
 * its been saved" — and the distinction is the whole point of the pair of them.
 * One is what this person decided; the other is the app's guess at it, and a
 * guess that dresses itself up as a decision is how a guess ends up in the
 * history.
 *
 * "list" cannot appear here: the suggestion is computed WITHOUT the saved value
 * on purpose, so it stays a second opinion rather than an echo.
 */
const HINT_WORDS: Record<PitchSource, string> = {
  list: "saved",
  sung: "you have sung it here",
  predicted: "predicted for you",
  reference: "the masterlist reference",
  none: "",
};

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "recent", label: "Recently changed" },
  { key: "title", label: "Title A–Z" },
  { key: "lastSung", label: "Last sung" },
  { key: "mostSung", label: "Most sung" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  // A session date is a calendar date: read it back in UTC, where it was
  // written, or it slips a day west of UTC. See CLAUDE.md.
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function LearningListView({
  singerId,
  singerName,
  rows,
  shrutiLabels,
  canEdit,
  /** Your own list reads "My list"; somebody else's is named. */
  mine,
}: {
  singerId: string;
  singerName: string;
  rows: ListRow[];
  shrutiLabels: string[];
  canEdit: boolean;
  mine: boolean;
}) {
  const [query, setQuery] = useState("");
  const [stages, setStages] = useState<RepertoireKind[]>([]);
  const [deity, setDeity] = useState<ValueFilter>(ANY_VALUES);
  const [raga, setRaga] = useState<ValueFilter>(ANY_VALUES);
  const [tempo, setTempo] = useState<ValueFilter>(ANY_VALUES);
  const [shruti, setShruti] = useState<ShrutiState[]>([]);
  const [sung, setSung] = useState<SungState[]>([]);
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [openFilters, setOpenFilters] = useState(false);

  /*
   * The options come from the rows themselves, not from the masterlist.
   *
   * A deity dropdown listing all forty when this person's list touches six is a
   * dropdown you have to read. Every option here is guaranteed to match at least
   * one row, so no choice can lead to an empty list on its own.
   */
  const { deities, ragas, tempos } = useMemo(() => {
    const d = new Set<string>();
    const r = new Set<string>();
    const t = new Set<string>();
    for (const row of rows) {
      row.deities.forEach((x) => d.add(x));
      if (row.raga) r.add(row.raga);
      if (row.tempo) t.add(row.tempo);
    }
    const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return { deities: sorted(d), ragas: sorted(r), tempos: sorted(t) };
  }, [rows]);

  const counts = useMemo(() => {
    const m = new Map<RepertoireKind, number>();
    for (const row of rows) m.set(row.kind, (m.get(row.kind) ?? 0) + 1);
    return m;
  }, [rows]);

  /*
   * The filter is assembled here and applied in lib/learningListFilter.ts,
   * where what each option MEANS — and every "missing field" edge it has to get
   * right — is pinned by tests. This component only collects the choices.
   */
  const filter: ListFilter = useMemo(
    () => ({
      query,
      stages,
      deity,
      raga,
      tempo,
      shruti,
      sung,
      unlinkedOnly,
      sort,
    }),
    [query, stages, deity, raga, tempo, shruti, sung, unlinkedOnly, sort],
  );
  const matches = useMemo(() => applyListFilter(rows, filter), [rows, filter]);
  const filtered = isFiltered(filter);

  const clearAll = () => {
    setQuery(EMPTY_FILTER.query);
    setStages(EMPTY_FILTER.stages);
    setDeity(EMPTY_FILTER.deity);
    setRaga(EMPTY_FILTER.raga);
    setTempo(EMPTY_FILTER.tempo);
    setShruti(EMPTY_FILTER.shruti);
    setSung(EMPTY_FILTER.sung);
    setUnlinkedOnly(EMPTY_FILTER.unlinkedOnly);
    // Sort is deliberately left alone — see isFiltered.
  };

  /** How many filters are narrowing the list, for the Filters button. */
  const activeFilters =
    (deity.values.length > 0 ? 1 : 0) +
    (raga.values.length > 0 ? 1 : 0) +
    (tempo.values.length > 0 ? 1 : 0) +
    (shruti.length > 0 ? 1 : 0) +
    (sung.length > 0 ? 1 : 0) +
    (unlinkedOnly ? 1 : 0);

  const toggleStage = (kind: RepertoireKind) =>
    setStages((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));

  /*
   * The blurb belongs to a stage, and there is no longer a stage heading to
   * hang it under. It appears when exactly one stage is selected, which is the
   * only moment it is describing what you are looking at.
   */
  const soleStage = stages.length === 1 ? STAGES.find((s) => s.kind === stages[0]) : undefined;

  return (
    <div id="list" className="grid gap-3">
      {/* ── The toolbar ─────────────────────────────────────────────────── */}
      <div className="grid gap-2.5 rounded-[14px] border border-rule-surface bg-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="list-search" className="sr-only">
              Search {mine ? "your list" : `${singerName}'s list`}
            </label>
            <input
              id="list-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a title, a note, a raga…"
              className="h-11 w-full rounded-[12px] border border-rule-surface bg-field px-3 text-sm"
            />
          </div>
          <label className="grid min-w-0 shrink gap-1">
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-11 w-full min-w-0 rounded-[12px] border border-rule-surface bg-field px-2.5 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Stages, as chips. Tapping more than one widens rather than narrows. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGES.map((s) => {
            const on = stages.includes(s.kind);
            return (
              <button
                key={s.kind}
                type="button"
                onClick={() => toggleStage(s.kind)}
                aria-pressed={on}
                className={[
                  "h-8 rounded-full border px-3 text-xs",
                  on
                    ? "border-brass bg-brass/15 font-semibold text-on-surface"
                    : "border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
                ].join(" ")}
              >
                {s.title} <span className="font-mono tabular-nums">{counts.get(s.kind) ?? 0}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setOpenFilters((v) => !v)}
            aria-expanded={openFilters}
            className="ml-auto h-8 rounded-full border border-rule-surface bg-field px-3 text-xs text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
          >
            Filters
            {activeFilters > 0 ? (
              <span className="ms-1 rounded-full bg-brass/25 px-1.5 font-mono text-[10px] font-semibold text-on-surface">
                {activeFilters}
              </span>
            ) : null}{" "}
            {openFilters ? "▴" : "▾"}
          </button>
        </div>

        {openFilters ? (
          <div className="grid min-w-0 gap-3 border-t border-rule-surface pt-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {deities.length > 0 ? (
              <MultiFilter
                label="Deity"
                options={deities}
                selected={deity.values}
                mode={deity.mode}
                onChange={(values) => setDeity({ ...deity, values })}
                onModeChange={(mode) => setDeity({ ...deity, mode })}
              />
            ) : null}
            {ragas.length > 0 ? (
              <MultiFilter
                label="Raga"
                options={ragas}
                selected={raga.values}
                mode={raga.mode}
                onChange={(values) => setRaga({ ...raga, values })}
                onModeChange={(mode) => setRaga({ ...raga, mode })}
              />
            ) : null}
            {tempos.length > 0 ? (
              <MultiFilter
                label="Tempo"
                options={tempos}
                selected={tempo.values}
                mode={tempo.mode}
                onChange={(values) => setTempo({ ...tempo, values })}
                onModeChange={(mode) => setTempo({ ...tempo, mode })}
              />
            ) : null}

            {/*
              No Only/Except on these two. Three named buckets, and "except this
              one" is simply the other two selected — a control that adds nothing
              is a control to read. Same reasoning that left fairness's
              part-of-day alone; see lib/learningListFilter.ts.
            */}
            <StateFilter
              label="Your shruti"
              selected={shruti}
              onChange={setShruti}
              options={[
                { value: "saved", label: "Saved" },
                { value: "missing", label: "Not set yet" },
                { value: "disagrees", label: "Disagrees" },
              ]}
            />

            <StateFilter
              label="Last sung"
              selected={sung}
              onChange={setSung}
              options={[
                { value: "never", label: "Never" },
                { value: "recent", label: `Last ${RECENT_DAYS} days` },
                { value: "stale", label: `Not in ${STALE_DAYS / 30} months` },
              ]}
            />

            <div className="grid min-w-0 gap-1.5">
              <span className="text-[11px] text-on-surface-muted">Catalogue</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unlinkedOnly}
                  onChange={(e) => setUnlinkedOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>Not in the masterlist</span>
              </label>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-on-surface-muted">
          <span>
            {filtered ? (
              <>
                <strong className="text-on-surface">{matches.length}</strong> of {rows.length}
              </>
            ) : (
              <>
                <strong className="text-on-surface">{rows.length}</strong>{" "}
                {rows.length === 1 ? "bhajan" : "bhajans"}
              </>
            )}
            {soleStage ? <> · {soleStage.blurb}</> : null}
          </span>
          {filtered ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-brass-ink underline underline-offset-2"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* ── The list ────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <p className="rounded-[12px] border border-rule-surface bg-panel px-3 py-3 text-sm text-on-surface-muted">
          {mine
            ? "Nothing on your list yet. Add a bhajan above, or find things on Explore."
            : `${singerName} has nothing on their list yet.`}
        </p>
      ) : matches.length === 0 ? (
        <p className="rounded-[12px] border border-rule-surface bg-panel px-3 py-3 text-sm text-on-surface-muted">
          Nothing on {mine ? "your" : "this"} list matches that. It searches this list only, so the
          bhajan may still exist in the masterlist —{" "}
          <Link href="/explore" className="text-brass-ink underline underline-offset-2">
            look on Explore
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-2">
          {matches.map((row) => (
            <ListCard
              key={row.id}
              row={row}
              singerId={singerId}
              shrutiLabels={shrutiLabels}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A multi-select over a small set of named states, with no Only/Except.
 *
 * Several read as "or": "not set yet" together with "disagrees" is one question
 * — which shrutis need attention — and it cannot be asked one option at a time.
 */
function StateFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: readonly T[];
  onChange: (values: T[]) => void;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-on-surface-muted">{label}</span>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="ms-auto text-[11px] text-brass-ink underline underline-offset-2"
          >
            Any
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(toggleValue(selected, o.value))}
              aria-pressed={on}
              className={[
                "rounded-full border px-2.5 py-0.5 text-xs",
                on
                  ? "border-brass/60 bg-brass/15 text-on-surface"
                  : "border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
              ].join(" ")}
            >
              {on ? "\u2713 " : ""}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One bhajan.
 *
 * The card carries what it always carried — title, the saved shruti and the
 * app's second opinion, when it was last sung, the note — plus the stage, which
 * used to be implied by which accordion you had opened and now has to be said.
 *
 * Editing stays behind a tap on "Edit", but moving between stages does not: that
 * is the thing people do several times a session, and it was already promoted
 * out of the disclosure once for exactly that reason.
 */
function ListCard({
  row,
  singerId,
  shrutiLabels,
  canEdit,
}: {
  row: ListRow;
  singerId: string;
  shrutiLabels: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The move is optimistic on the chip only — the row stays put until the
   * server confirms and the page refreshes.
   *
   * Re-sorting or dropping a card out of the current filter the instant you tap
   * would take the thing you are working on off the screen mid-gesture. Waiting
   * for the refresh keeps it under your finger.
   */
  const [movingTo, setMovingTo] = useState<RepertoireKind | null>(null);
  const shownKind = movingTo ?? row.kind;

  const run = (fd: FormData, to?: RepertoireKind) => {
    setError(null);
    if (to) setMovingTo(to);
    startTransition(async () => {
      const res = await upsertLearning(fd);
      if (!res.ok) {
        setMovingTo(null);
        setError("error" in res ? res.error : "That could not be saved.");
        return;
      }
      setMovingTo(null);
      setOpen(false);
      router.refresh();
    });
  };

  const move = (kind: RepertoireKind) => {
    const fd = new FormData();
    // A move, not an add — see upsertLearning.
    fd.set("move", "1");
    fd.set("singerId", singerId);
    fd.set("title", row.title);
    fd.set("kind", kind);
    fd.set("note", row.note ?? "");
    fd.set("preferredPitch", row.preferredPitch ?? "");
    run(fd, kind);
  };

  const days = daysSince(row.lastSungISO, Date.now());
  const worthACheck = disagrees(row);

  return (
    <li
      className={`rounded-[12px] border border-rule-surface bg-panel p-3 ${
        pending ? "opacity-60" : ""
      }`}
    >
      {/*
        The words get the full width of the card.

        Edit and Remove used to sit to the right of them, which on a 375px phone
        left the title about 200px — enough to break "Sai Natha Deena Natha"
        across two lines and split the shruti pill in half. They have moved down
        to the end of the stage row, where there is already a row of controls and
        room to spare.
      */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {row.bhajanId ? (
            <Link
              href={`/bhajans/${row.bhajanId}`}
              className="flex min-w-0 items-center gap-2 font-medium underline-offset-2 hover:underline"
            >
              <DeitySymbols deities={row.deities} size={16} />
              {/*
                  WRAPS, never truncates. `truncate` sets `white-space: nowrap`,
                  which makes the title's min-content the width of the whole
                  string — and since a card is a grid item, that became the
                  minimum width of the grid, of the page, and of every other card
                  on it. One long title ("Namah Shivaya Namah Shivaya
                  (Vakulabharanam / …)") pushed the singer page to 569px inside a
                  375px phone and the whole thing scrolled sideways.

                  Wrapping is also the better answer on its own terms: the title
                  is what the card is FOR, and a second line costs less than an
                  ellipsis on the thing you are scanning for.
                */}
              <span className="min-w-0 break-words">{row.title}</span>
            </Link>
          ) : (
            <span className="font-medium">
              {row.title} <Badge tone="warn">not in the masterlist</Badge>
            </span>
          )}
          {/*
              The stage, on the card. It was carried by the accordion you had
              opened, and one flowing list has to say it.

              Only when you cannot edit. With the three move buttons below, the
              current stage is already shown — as the one that is filled in and
              disabled — so a chip saying "KNOW IT" above a highlighted "Know it"
              button is the same fact twice on a card that is tall enough
              already. Somebody reading another singer's list has no buttons, so
              for them the chip is the only thing that says it.
            */}
          {canEdit ? null : (
            <span className="rounded-full border border-rule-surface bg-field px-2 py-0.5 text-[10px] uppercase tracking-wide text-on-surface-muted">
              {STAGE_TITLE[shownKind]}
            </span>
          )}
        </div>

        {/*
            THE SHRUTI, AND HOW MUCH IT IS WORTH.

            Two different claims, and they must not look alike. A saved shruti is
            this singer's own decision and reads like one — solid border,
            "saved". A hint is the app's guess and reads like a guess: dashed,
            quieter, and named after where it came from.

            The hint stays visible alongside a saved shruti when the two
            disagree, because that disagreement is worth seeing — it is usually
            either a voice that has moved or a value saved in a hurry. It is now
            also a filter.
          */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {row.preferredPitch ? (
            <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-brass/45 bg-brass/[0.08] px-1.5 py-0.5 text-xs">
              <span className="font-mono tabular font-semibold">{row.preferredPitch}</span>
              <span className="text-[10px] text-on-surface-muted">your shruti · saved</span>
            </span>
          ) : null}
          {row.hintPitch && row.hintPitch !== row.preferredPitch ? (
            <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-rule-surface bg-field px-1.5 py-0.5 text-xs text-on-surface-muted">
              <span className="font-mono tabular">{row.hintPitch}</span>
              <span className="text-[10px]">
                {row.hintSource ? HINT_WORDS[row.hintSource] : ""}
              </span>
            </span>
          ) : null}
          {worthACheck ? (
            <span className="text-[10px] text-on-surface-muted">— worth a check</span>
          ) : null}
        </div>

        <p className="mt-1 text-[11px] text-on-surface-muted">
          {row.lastSungISO ? (
            <>
              last sung {formatDate(row.lastSungISO)}
              {row.timesSung > 1 ? ` · ${row.timesSung}×` : ""}
              {days !== null && days > STALE_DAYS ? " · a while ago" : ""}
            </>
          ) : (
            "not sung here yet"
          )}
          {row.raga ? ` · ${row.raga}` : ""}
          {row.tempo ? ` · ${row.tempo}` : ""}
        </p>

        {row.note ? <p className="mt-1 whitespace-pre-wrap text-sm">{row.note}</p> : null}
      </div>

      {/* Moving between the three stages, in one tap — never behind a disclosure. */}
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {STAGES.map((s) => (
            <button
              key={s.kind}
              type="button"
              disabled={shownKind === s.kind || pending}
              onClick={() => move(s.kind)}
              className={[
                "h-7 rounded-full border px-2.5 text-[11px] disabled:cursor-default",
                shownKind === s.kind
                  ? "border-brass bg-brass/15 font-semibold text-on-surface"
                  : "border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
              ].join(" ")}
            >
              {s.title}
            </button>
          ))}

          {/* Pushed to the end, and wrapping to their own line when there is no
              room — they are the rarer pair of the five controls on this row. */}
          <span className="ms-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="h-7 rounded-full border border-rule-surface bg-field px-2.5 text-[11px] text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
            >
              {open ? "Close" : "Edit"}
            </button>
            <form action={removeLearning}>
              <input type="hidden" name="id" value={row.id} />
              <button
                type="submit"
                className="h-7 rounded-full border border-rule-surface bg-field px-2.5 text-[11px] text-on-surface-muted hover:border-kumkum hover:text-kumkum"
              >
                Remove
              </button>
            </form>
          </span>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-kumkum">{error}</p> : null}

      {canEdit && open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            // Editing an entry that exists, not adding one.
            fd.set("move", "1");
            fd.set("singerId", singerId);
            fd.set("title", row.title);
            run(fd);
          }}
          className="mt-3 grid gap-2 border-t border-rule-surface pt-3"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] text-on-surface-muted">Status</span>
              <select
                name="kind"
                defaultValue={row.kind}
                className="h-11 w-full min-w-0 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s.kind} value={s.kind}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1">
              {/*
                The suggestion sits ABOVE the field it is for, as Sailavan asked,
                because it is the answer to the question the field asks and
                reading it afterwards is no use.

                Offered as the first option as well as stated, so taking it is one
                tap. Never PRE-SELECTED: a pre-selected guess is saved by anybody
                who came here to change the note, and then it is
                indistinguishable from a decision.
              */}
              {row.hintPitch ? (
                <span className="text-[11px] text-on-surface-muted">
                  {row.hintSource ? HINT_WORDS[row.hintSource] : "suggested"}:{" "}
                  <span className="font-mono tabular text-on-surface">{row.hintPitch}</span>
                </span>
              ) : null}
              <span className="text-[11px] text-on-surface-muted">Shruti you want</span>
              <select
                name="preferredPitch"
                defaultValue={row.preferredPitch ?? ""}
                className="h-11 w-full min-w-0 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
              >
                <option value="">—</option>
                {row.hintPitch && row.hintPitch !== row.preferredPitch ? (
                  <optgroup label={row.hintSource ? HINT_WORDS[row.hintSource] : "suggested"}>
                    <option value={row.hintPitch}>{row.hintPitch}</option>
                  </optgroup>
                ) : null}
                <optgroup label="Every shruti">
                  {shrutiLabels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] text-on-surface-muted">Note</span>
            <Textarea
              name="note"
              rows={3}
              defaultValue={row.note ?? ""}
              placeholder="What is tricky, where you heard it, who taught it…"
            />
          </label>
          <div>
            <Button type="submit" variant="primary" className="h-9 text-xs" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
