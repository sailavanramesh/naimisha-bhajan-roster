"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { addSingerSlot, removeSingerSlot, goToSessionForDate, autoAddFairestSingers } from "./actions";
import { SongsLink } from "./SongsLink";
import { SOURCE_LABEL, type SuggestedPitch } from "@/lib/suggestedPitch";

export type Suggestion = {
  bhajanId: string;
  title: string;
  deities: string[];
  raga: string | null;
  /** Why it is being suggested — "knows it", "same raga", … */
  reasons: string[];
  pitch: SuggestedPitch;
};

export type SuggestionGroup = {
  key: string;
  heading: string;
  blurb: string;
  items: Suggestion[];
};

/**
 * How many suggestions a group shows before "show N more".
 *
 * A singer's own list can run to ninety. All of it is sent so the search box
 * can reach it, but a wall of ninety rows above the roster is not a choice
 * either — twelve is about what fits on a phone without scrolling past the
 * thing you came to do.
 */
const VISIBLE = 12;

export type LineupEntry = {
  slotId: string;
  position: number;
  /** Who holds the slot, so the panel can offer to pick them a bhajan. */
  singerId: string | null;
  singerName: string;
  bhajanTitle: string | null;
  /** Real history. Such a slot cannot be removed from here — see the action. */
  hasConfirmedPitch: boolean;
};

/**
 * Singer-first rostering.
 *
 * The rest of this page works the other way round — slots already have bhajans
 * and singers are fitted to them fairly. That is the right tool once a session
 * has been built. This is for the other half of the job: somebody is
 * available, what should they sing.
 *
 * Structured around the fact that rostering is a RUN of decisions, not one.
 * The singer list is always on screen, so the next person is one click away;
 * expanding somebody's suggestions never hides it; and adding somebody returns
 * here rather than to the roster.
 *
 * Every singer therefore offers two things, because both are real intentions:
 *   "Add"         — put them on now, they will choose a bhajan later
 *   "Suggestions" — show me what they could sing before I decide
 */
export function AddSingerPanel({
  sessionId,
  singers,
  selected,
  groups,
  basePath,
  lineup,
  sessionDate,
}: {
  sessionId: string;
  singers: Array<{ id: string; name: string; gender: string | null; unavailable?: boolean }>;
  selected: { id: string; name: string } | null;
  groups: SuggestionGroup[];
  basePath: string;
  lineup: LineupEntry[];
  sessionDate: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /*
   * The chip appears the moment you click, before the server has heard about
   * it. Adding somebody is a near-certain success — the only refusal is a
   * capability check that already passed to render this panel — so waiting for
   * the round trip to draw it was making a decision feel slower than it is.
   * React reconciles against the server list when the transition settles, so a
   * genuine failure corrects itself rather than leaving a phantom name.
   */
  const [shown, applyOptimistic] = useOptimistic(
    lineup,
    (current: LineupEntry[], change: { type: "add"; name: string } | { type: "remove"; slotId: string }) =>
      change.type === "add"
        ? [
            ...current,
            {
              slotId: `pending-${change.name}-${current.length}`,
              position: current.length + 1,
              // No id until the server answers; the songs link waits for it.
              singerId: null,
              singerName: change.name,
              bhajanTitle: null,
              hasConfirmedPitch: false,
            },
          ]
        : current.filter((l) => l.slotId !== change.slotId),
  );
  /** Which control is mid-flight, so only that one shows a spinner. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Per-group search text, and which groups have had their cap lifted. */
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (key: string, work: () => Promise<void>) => {
    setBusy(key);
    startTransition(async () => {
      try {
        await work();
        // Pull the updated server render in the same transition, so the list
        // and the spinner change together rather than in two steps.
        router.refresh();
      } catch (e) {
        /*
         * Show what the server said. A Server Action that throws takes the
         * whole panel down through the error boundary — a refusal to roster
         * somebody with no recorded voice wiped the lineup off the screen
         * instead of explaining itself. The optimistic entry disappears on its
         * own when the transition unwinds, so the list corrects itself.
         */
        setNotice(
          e instanceof Error && e.message
            ? e.message
            : "That did not save. Reload the page and try again.",
        );
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const add = (singerId: string, name: string, bhajanId?: string, confirmedPitch?: string) =>
    run(`add:${singerId}:${bhajanId ?? ""}`, async () => {
      applyOptimistic({ type: "add", name });
      setJustAdded(name);
      setNotice(null);
      const res = await addSingerSlot({
        sessionId,
        singerId,
        bhajanId: bhajanId ?? null,
        confirmedPitch: confirmedPitch ?? null,
      });
      if (!res.ok) {
        setNotice(res.error);
        setJustAdded(null);
      }
    });

  /**
   * Put the fairest few on in one go.
   *
   * An extra route, not a replacement for picking by hand — that stays the
   * mainstay. Three because that is the group's usual session length
   * (CLAUDE.md: 163 of 188 sessions are three or four).
   */
  const autoAdd = (count: number) =>
    run(`auto:${count}`, async () => {
      setNotice(null);
      const res = await autoAddFairestSingers({ sessionId, count });
      if (!res.ok) setNotice(res.error);
      else {
        setJustAdded(res.added[res.added.length - 1] ?? null);
        setNotice(
          `Added ${res.added.join(", ")} — the ${res.added.length} most owed a turn. Change any of them below.`,
        );
      }
    });

  const remove = (slotId: string) => {
    const entry = lineup.find((l) => l.slotId === slotId);
    /*
     * Refuse client-side first. The lineup already carries hasConfirmedPitch,
     * so asking the server only to be told no was a round trip spent on a
     * question we could already answer. The server still enforces it — this is
     * the fast path, not the rule.
     */
    if (entry?.hasConfirmedPitch) {
      setNotice(
        `${entry.singerName} has a confirmed pitch recorded, so removing them here would destroy what they actually sang. Remove them on the roster instead, where the pitch is visible.`,
      );
      return;
    }

    run(`rm:${slotId}`, async () => {
      applyOptimistic({ type: "remove", slotId });
      setNotice(null);
      if (entry && justAdded === entry.singerName) setJustAdded(null);
      const res = await removeSingerSlot({ sessionId, slotId });
      if (!res.ok) {
        setNotice(
          `${res.name} has a confirmed pitch recorded, so removing them here would destroy what they actually sang. Remove them on the roster instead, where the pitch is visible.`,
        );
      }
    });
  };

  return (
    <div className="grid gap-4">
      {/*
        The date lives here because rostering starts from "who is around on
        Thursday", not from a session id. Switching creates the session if that
        day does not have one yet, the same as tapping an empty day on the
        calendar.
      */}
      <form action={goToSessionForDate} className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-on-surface-muted">
          Session date
          <input
            type="date"
            name="date"
            defaultValue={sessionDate}
            className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
          />
        </label>
        <Button type="submit" className="h-9 text-xs">
          Switch date
        </Button>
        <span className="pb-1.5 text-xs text-on-surface-muted">
          Creates the session if that day has none.
        </span>
      </form>

      {notice ? (
        <p role="status" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      {/*
        One place showing who is on, rather than a banner naming the last add
        AND a separate list. Naming a single singer was the thing that confused:
        after adding three people it still said "Added Ashwin", which is true,
        useless, and looks broken next to three names. The count and the names
        answer the question directly, and the one just added is marked.
      */}
      <div className="grid gap-1.5 rounded-[10px] border border-rule-surface bg-panel px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-sm">
            <strong>
              {shown.length} {shown.length === 1 ? "singer" : "singers"}
            </strong>{" "}
            on {sessionDate}
          </span>
          <Link
            href={`/roster/${sessionId}`}
            className="text-xs underline underline-offset-2"
          >
            Go to the roster
          </Link>
        </div>

        {shown.length === 0 ? (
          <span className="text-sm text-on-surface-muted">
            Nobody yet — add somebody with + below.
          </span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {shown.map((l) => {
              const isNew = justAdded !== null && l.singerName === justAdded;
              return (
                <li
                  key={l.slotId}
                  className={[
                    "inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-xs",
                    isNew ? "border-brass/60 bg-brass/[0.10] font-semibold" : "border-rule-surface bg-surface",
                  ].join(" ")}
                  title={l.bhajanTitle ?? "no bhajan yet"}
                >
                  {l.singerName}
                  {l.bhajanTitle ? "" : " · no bhajan"}
                  {isNew ? <span className="text-[10px] font-normal text-brass-ink">just added</span> : null}
                  {/*
                    Pick them a song from here.
                    Sailavan: "when they are added by fairness, there should be a
                    way to select a song for them like in the gents and ladies
                    dropdowns where there is the songs option." Fairness leaves
                    the bhajan blank on purpose — who sings and what they sing
                    are separate decisions — so without this the only route to
                    the second was to find the same person again further down
                    the page. Same link, same panel.
                  */}
                  {l.singerId && !l.bhajanTitle ? (
                    <Link
                      href={`${basePath}?add=${l.singerId}`}
                      title={`Choose a bhajan for ${l.singerName}`}
                      className="rounded-full px-1 text-[10px] font-semibold text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                    >
                      songs
                    </Link>
                  ) : null}
                  <button
                      type="button"
                      onClick={() => remove(l.slotId)}
                      disabled={busy === `rm:${l.slotId}`}
                      aria-label={`Remove ${l.singerName} from this session`}
                      title={
                        l.hasConfirmedPitch
                          ? `${l.singerName} has a confirmed pitch — remove them on the roster instead`
                          : `Remove ${l.singerName}`
                      }
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[12px] leading-none text-on-surface-muted hover:bg-rule-surface hover:text-on-surface"
                    >
                      <span aria-hidden>{busy === `rm:${l.slotId}` ? "·" : "×"}</span>
                    </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/*
        Fairness in one press. Sits above the by-hand list and is deliberately
        the smaller control of the two: it is the shortcut, not the method.
      */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-rule-surface bg-panel px-3 py-2">
        <span className="text-xs text-on-surface-muted">Or fill it by fairness:</span>
        {[3, 4].map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy === `auto:${n}`}
            onClick={() => autoAdd(n)}
            className="inline-flex h-7 items-center rounded-full border border-brass/45 bg-brass/[0.08] px-3 text-xs font-semibold text-brass-ink hover:border-brass/70 disabled:opacity-60"
          >
            {busy === `auto:${n}` ? "adding…" : `Add ${n} fairest`}
          </button>
        ))}
        <span className="w-full text-[11px] text-on-surface-muted sm:w-auto">
          Whoever is most owed a turn, alternating voice. No bhajans — those are still yours to
          choose.
        </span>
      </div>

      {/*
        Split by voice, because that is how a coordinator thinks about a set —
        the reference pitch differs by voice and sessions alternate loosely
        between them, so "who else is available" is nearly always asked within
        one group rather than across both.
      */}
      {groupsByVoice(singers).map((voice) => (
        <div key={voice.label} className="grid gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
            {voice.label}
          </h4>
          <SingerChips
            singers={voice.singers}
            basePath={basePath}
            openId={selected?.id ?? null}
            onAdd={add}
            busyKey={busy}
          />
        </div>
      ))}

      {selected ? (
        <section className="grid gap-4 rounded-[12px] border border-brass/35 bg-panel/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">What {selected.name} could sing</h3>
            <Link
              href={basePath}
              className="text-xs text-on-surface-muted underline underline-offset-2"
            >
              Collapse
            </Link>
          </div>

          {groups.every((g) => g.items.length === 0) ? (
            <p className="text-sm text-on-surface-muted">
              Nothing to suggest for {selected.name} yet — no list and no history to work
              from. Add them with the + above and fill the bhajan in on the roster.
            </p>
          ) : null}

          {groups.map((group) => {
            const q = queries[group.key]?.trim().toLowerCase() ?? "";
            const matches = q
              ? group.items.filter(
                  (i) =>
                    i.title.toLowerCase().includes(q) ||
                    (i.raga ?? "").toLowerCase().includes(q) ||
                    i.deities.some((d) => d.toLowerCase().includes(q)),
                )
              : group.items;
            // Searching means you are after a particular song, so the cap comes
            // off — a search that hides its own results is worse than no search.
            const shown = q || expanded[group.key] ? matches : matches.slice(0, VISIBLE);
            const hidden = matches.length - shown.length;

            return group.items.length === 0 ? null : (
              <div key={group.key} className="grid gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold">
                      {group.heading}{" "}
                      <span className="font-normal text-on-surface-muted">
                        ({group.items.length})
                      </span>
                    </h4>
                    <p className="text-xs text-on-surface-muted">{group.blurb}</p>
                  </div>
                  {/*
                    Only where it earns its space. A group of six is already
                    all on screen, and a search box over it is furniture.
                  */}
                  {group.items.length > VISIBLE ? (
                    <input
                      type="search"
                      value={queries[group.key] ?? ""}
                      onChange={(e) =>
                        setQueries((prev) => ({ ...prev, [group.key]: e.target.value }))
                      }
                      placeholder={`Search ${group.items.length}…`}
                      aria-label={`Search ${group.heading.toLowerCase()}`}
                      className="h-8 w-40 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface placeholder:text-on-surface-muted"
                    />
                  ) : null}
                </div>

                {q && matches.length === 0 ? (
                  <p className="text-xs text-on-surface-muted">
                    Nothing in this group matches “{queries[group.key]}”.
                  </p>
                ) : null}

                <ul className="grid gap-1.5">
                  {shown.map((item) => (
                    <li
                      key={`${group.key}-${item.bhajanId}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] border border-rule-surface bg-surface px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <DeitySymbols deities={item.deities} size={16} />
                          <Link
                            href={`/bhajans/${item.bhajanId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium underline-offset-2 hover:underline"
                          >
                            {item.title}
                          </Link>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-on-surface-muted">
                          {item.raga ? <span className="italic">{item.raga}</span> : null}
                          {item.reasons.length > 0 ? (
                            <span>· {item.reasons.join(", ")}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <PitchChip pitch={item.pitch} />
                        {/*
                          Only a pitch they have actually committed to is
                          carried into confirmedPitch. A prediction is shown
                          but never written — see addSingerSlot.
                        */}
                        <Button
                          type="button"
                          className="h-8 text-xs"
                          disabled={busy === `add:${selected.id}:${item.bhajanId}`}
                          onClick={() =>
                            add(
                              selected.id,
                              selected.name,
                              item.bhajanId,
                              item.pitch.source === "list" || item.pitch.source === "sung"
                                ? (item.pitch.pitch ?? undefined)
                                : undefined,
                            )
                          }
                        >
                          {busy === `add:${selected.id}:${item.bhajanId}` ? "…" : "Add"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>

                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [group.key]: true }))}
                    className="justify-self-start text-xs text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                  >
                    Show {hidden} more
                  </button>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : (
        <p className="text-xs text-on-surface-muted">
          <strong>+</strong> adds them straight away with no bhajan;{" "}
          <strong>songs</strong> shows what they could sing first.
        </p>
      )}
    </div>
  );
}

function PitchChip({ pitch }: { pitch: SuggestedPitch }) {
  if (!pitch.pitch) return null;

  const committed = pitch.source === "list" || pitch.source === "sung";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-[8px] border px-2 py-1 font-mono text-xs",
        committed ? "border-brass/45 bg-field font-semibold" : "border-rule-surface bg-field/60",
      ].join(" ")}
      title={
        pitch.conflicted
          ? `Their list and their history disagree (${pitch.considered.join(", ")}) — the lower is shown`
          : SOURCE_LABEL[pitch.source]
      }
    >
      {pitch.pitch}
      <span className="font-sans text-[10px] font-normal text-on-surface-muted">
        {SOURCE_LABEL[pitch.source]}
      </span>
      {pitch.conflicted ? (
        <span className="font-sans text-[10px] font-semibold text-warn" title="lower of two">
          ↓
        </span>
      ) : null}
    </span>
  );
}

/** Gents first, then Ladies, then anyone with no voice recorded. */
function groupsByVoice(
  singers: Array<{ id: string; name: string; gender: string | null }>,
): Array<{ label: string; singers: Array<{ id: string; name: string; gender: string | null }> }> {
  const order = ["Gents", "Ladies"];
  const out: Array<{ label: string; singers: typeof singers }> = [];
  for (const label of order) {
    const group = singers.filter((s) => s.gender === label);
    if (group.length > 0) out.push({ label, singers: group });
  }
  const rest = singers.filter((s) => !order.includes(s.gender ?? ""));
  // Never silently drop somebody whose voice was never recorded.
  if (rest.length > 0) out.push({ label: "Voice not recorded", singers: rest });
  return out;
}

function SingerChips({
  singers,
  basePath,
  openId,
  onAdd,
  busyKey,
}: {
  singers: Array<{ id: string; name: string; gender: string | null; unavailable?: boolean }>;
  basePath: string;
  openId: string | null;
  onAdd: (singerId: string, name: string) => void;
  busyKey: string | null;
}) {
  /*
   * Adding somebody who has said they cannot sing takes two presses.
   *
   * Not a refusal. Only the singer can clear their own dates, so a hard block
   * would leave a coordinator unable to roster somebody who has just told them
   * in person that their plans changed — with no way out but to wait for that
   * person to log in. That is a worse failure than the one it prevents.
   *
   * So the first press asks, inline rather than in a dialog, and the second
   * goes ahead. It costs nothing when the coordinator means it and stops the
   * accidental add, which is what actually happened: three people were added to
   * the 27th while marked away, without the app saying a word.
   */
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <ul className="flex flex-wrap gap-1.5">
      {singers.map((s) => {
        const open = openId === s.id;
        /*
         * They have said they cannot sing on this date.
         *
         * Shown the same way whatever the reason, because the rosterer is not
         * told the reason — a date somebody marked by hand and a date their
         * cycle predicts are the same fact here. Dimmed rather than removed:
         * plans change, and hiding somebody would leave the rosterer wondering
         * where they went.
         */
        const away = s.unavailable === true;
        return (
          <li
            key={s.id}
            title={away ? `${s.name} is not available on this date` : undefined}
            className={[
              "inline-flex items-stretch overflow-hidden rounded-full border",
              open ? "border-brass/60 bg-brass/[0.08]" : "border-rule-surface bg-field",
              away && confirming !== s.id ? "opacity-55" : "",
              confirming === s.id ? "border-kumkum" : "",
            ].join(" ")}
            onMouseLeave={() => confirming === s.id && setConfirming(null)}
          >
            {/* Quick add — no expanding, no bhajan. */}
            <button
              type="button"
              onClick={() => {
                if (away && confirming !== s.id) {
                  setConfirming(s.id);
                  return;
                }
                setConfirming(null);
                onAdd(s.id, s.name);
              }}
              disabled={busyKey === `add:${s.id}:`}
              title={
                away
                  ? `${s.name} is not available on this date`
                  : `Add ${s.name} now, without choosing a bhajan`
              }
              className="inline-flex h-8 items-center gap-1.5 pl-3 pr-2 text-sm hover:bg-panel-hover disabled:opacity-70"
            >
              <span aria-hidden className="text-brass-ink">
                {busyKey === `add:${s.id}:` ? "…" : "+"}
              </span>
              {s.name}
              {away ? (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={confirming === s.id ? { color: "rgb(var(--kumkum))" } : undefined}
                >
                  {confirming === s.id ? "add anyway?" : "away"}
                </span>
              ) : null}
            </button>

            <SongsLink
              href={open ? basePath : `${basePath}?add=${s.id}`}
              open={open}
              singerName={s.name}
            />
          </li>
        );
      })}
    </ul>
  );
}
