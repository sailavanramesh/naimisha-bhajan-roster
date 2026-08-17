import Link from "next/link";
import { prisma } from "@/lib/db";
import { Gender, RepertoireKind } from "@prisma/client";
import { suggestPitch, type PitchSource } from "@/lib/suggestedPitch";
import { predictForSinger } from "@/lib/singerProfile";
import { getSingerProfile } from "@/lib/pitchQueries";
import { historyCutoff } from "@/lib/dates";
import { Button, Textarea, Badge } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { upsertLearning, removeLearning } from "@/app/my-list/actions";
import { AddToListForm } from "@/components/AddToListForm";

/**
 * components/LearningList.tsx — one person's bhajans: wanted, learning, known.
 *
 * This used to be a page of its own at /my-list, sitting beside /singers,
 * which meant two places answered "what does this person sing" and neither
 * answered it completely. Sailavan, 2026-08-12: "combine singers and my list
 * in a nice logical way." The logical way is that a singer's list is part of
 * the singer, so it lives on their page — under their pitch profile and their
 * history, which is the rest of the same story. /my-list is now a door to your
 * own page rather than a separate room.
 *
 * Collapsed by default. Combining the two pages put a pitch profile, a shruti
 * ladder, a raga table, fifty rows of history and up to ninety list entries on
 * one page — Sailavan, 2026-08-12: "too much data on the singers page bcos we
 * combined it. they should be together, but better organised. too much to
 * scroll through." Being together and being all visible at once are different
 * things: each stage is a summary line with a count, and opens when it is the
 * one you want.
 *
 * `canEdit` is what separates reading somebody's list from keeping your own.
 * The forms are simply absent without it — a member looking at another
 * singer's page sees what they sing and cannot touch it.
 *
 * Graduating something to "know it" writes a `known` repertoire row, which is
 * the row the session builder already scores against, so becoming confident in
 * a bhajan makes it start appearing in suggestions with no separate wiring.
 */

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

export const STAGES: Array<{ kind: RepertoireKind; title: string; blurb: string }> = [
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

export async function LearningList({
  singerId,
  singerName,
  canEdit,
}: {
  singerId: string;
  singerName: string;
  canEdit: boolean;
}) {
  const [entries, labels, singer] = await Promise.all([
    prisma.singerRepertoire.findMany({
      where: {
        singerId,
        kind: {
          in: [RepertoireKind.wantToLearn, RepertoireKind.learning, RepertoireKind.known],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      include: { bhajan: { include: { deities: { include: { deity: true } } } } },
    }),
    prisma.pitchLabel.findMany({
      orderBy: [{ step: "asc" }, { series: "asc" }],
      select: { label: true },
    }),
    prisma.singer.findUnique({ where: { id: singerId }, select: { gender: true } }),
  ]);

  /*
   * WHAT WOULD THIS PERSON SING EACH OF THESE AT?
   *
   * Sailavan asked for the predicted pitch to appear in all three stages, above
   * "Shruti you want" — because the question the field asks is one most people
   * cannot answer cold, and the app has been able to answer it for a while in
   * the roster grid and nowhere else.
   *
   * Computed WITHOUT the saved value, deliberately. Feeding `listPitch` back in
   * would make the hint agree with the field it sits above every time, which
   * tells nobody anything; leaving it out keeps it a second opinion, and lets a
   * saved shruti be checked against what the singer has actually done.
   *
   * One extra query for the whole list — every pitch this singer has confirmed
   * for any bhajan on it — rather than one per row.
   */
  const bhajanIds = entries.map((e) => e.bhajanId).filter((x): x is string => Boolean(x));
  const [sung, profileRow] = await Promise.all([
    bhajanIds.length > 0
      ? prisma.sessionSlot.findMany({
          // Only what has actually happened. A pitch typed onto next Thursday is
          // a plan, and a plan is not evidence of anything (lib/dates.ts).
          where: {
            singerId,
            bhajanId: { in: bhajanIds },
            session: { date: { lte: historyCutoff() } },
          },
          select: { bhajanId: true, confirmedPitch: true },
        })
      : Promise.resolve([]),
    getSingerProfile(singerId, singerName),
  ]);

  const sungPitches = new Map<string, string[]>();
  for (const s of sung) {
    if (!s.bhajanId || !s.confirmedPitch) continue;
    sungPitches.set(s.bhajanId, [...(sungPitches.get(s.bhajanId) ?? []), s.confirmedPitch]);
  }

  const labelStrings = labels.map((l) => l.label);
  const hintFor = (e: (typeof entries)[number]) => {
    if (!e.bhajan) return null;
    const reference =
      singer?.gender === Gender.Ladies
        ? e.bhajan.referenceLadiesPitch
        : e.bhajan.referenceGentsPitch;
    const predicted = predictForSinger(profileRow.profile, reference, e.bhajan.raga, labelStrings);
    const hint = suggestPitch({
      sungPitches: sungPitches.get(e.bhajan.id) ?? [],
      predicted: predicted.predicted ? predicted.label : null,
      reference,
    });
    return hint.pitch ? hint : null;
  };

  const byStage = new Map(STAGES.map((s) => [s.kind, entries.filter((e) => e.kind === s.kind)]));

  return (
    <div id="list" className="grid gap-4">
      <h2 className="mt-2 font-display text-lg font-semibold">{singerName}&rsquo;s list</h2>

      {canEdit ? (
        <details className="rounded-[12px] border border-rule-surface bg-panel">
          <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold">
            <span>Add a bhajan</span>
            <span className="text-xs font-normal text-on-surface-muted">
              wanted, learning, or known
            </span>
          </summary>
          <div className="grid gap-3 px-4 pb-4">
            <p className="max-w-2xl text-sm text-on-surface-muted">
              Move one to <strong>Know it</strong> and it starts counting in the session
              builder, so it will be suggested. Find things to add on{" "}
              <Link href="/explore" className="text-brass-ink underline underline-offset-2">
                Explore
              </Link>
              .
            </p>
            <AddToListForm singerId={singerId} />
          </div>
        </details>
      ) : null}

      {STAGES.map((stage) => {
        const rows = byStage.get(stage.kind) ?? [];
        // Somebody else's empty stages are noise; your own are a prompt.
        if (rows.length === 0 && !canEdit) return null;
        return (
          <details key={stage.kind} className="rounded-[12px] border border-rule-surface bg-panel">
            <summary className="flex cursor-pointer select-none items-baseline justify-between gap-3 px-4 py-3">
              <span className="text-sm font-semibold">{stage.title}</span>
              <span className="text-xs text-on-surface-muted">
                {rows.length === 0 ? "none" : rows.length}
              </span>
            </summary>
            <div className="grid gap-2 px-4 pb-4">
              <p className="text-xs text-on-surface-muted">{stage.blurb}</p>
              {rows.length === 0 ? (
                <p className="text-sm text-on-surface-muted">Nothing here yet.</p>
              ) : (
                rows.map((e) => {
                  const hint = hintFor(e);
                  return (
                  <div
                    key={e.id}
                    className="rounded-[12px] border border-rule-surface bg-panel p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {e.bhajanId ? (
                          <Link
                            href={`/bhajans/${e.bhajanId}`}
                            className="flex items-center gap-2 font-medium underline-offset-2 hover:underline"
                          >
                            <DeitySymbols
                              deities={e.bhajan?.deities.map((d) => d.deity.name) ?? []}
                              size={16}
                            />
                            {e.title}
                          </Link>
                        ) : (
                          <span className="font-medium">
                            {e.title} <Badge tone="warn">not in the masterlist</Badge>
                          </span>
                        )}
                        {/*
                          No "festival" tag. It was worth showing while the
                          festival/known duplicates were being untangled — it
                          said which rows had come from the festival sheet —
                          and now that every row is at exactly one stage it is
                          a label nobody acts on. The flag is still stored.
                        */}
                        {/*
                          THE SHRUTI, AND HOW MUCH IT IS WORTH.

                          Two different claims, and they must not look alike. A
                          saved shruti is this singer's own decision and reads
                          like one — solid border, "saved". A hint is the app's
                          guess and reads like a guess: dashed, quieter, and
                          named after where it came from. Sailavan: the saved one
                          "should say something different to predicted or
                          recommended pitch to highlight its been saved".

                          The hint stays visible alongside a saved shruti when the
                          two disagree, because that disagreement is worth seeing
                          — it is usually either a voice that has moved or a value
                          saved in a hurry.
                        */}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {e.preferredPitch ? (
                            <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-brass/45 bg-brass/[0.08] px-1.5 py-0.5 text-xs">
                              <span className="font-mono tabular font-semibold">
                                {e.preferredPitch}
                              </span>
                              <span className="text-[10px] text-on-surface-muted">
                                your shruti · saved
                              </span>
                            </span>
                          ) : null}
                          {hint && hint.pitch !== e.preferredPitch ? (
                            <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-rule-surface bg-field px-1.5 py-0.5 text-xs text-on-surface-muted">
                              <span className="font-mono tabular">{hint.pitch}</span>
                              <span className="text-[10px]">{HINT_WORDS[hint.source]}</span>
                            </span>
                          ) : null}
                        </div>
                        {e.note ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm">{e.note}</p>
                        ) : null}
                      </div>

                      {canEdit ? (
                        <form action={removeLearning}>
                          <input type="hidden" name="id" value={e.id} />
                          <Button type="submit" variant="danger" className="h-9 text-xs">
                            Remove
                          </Button>
                        </form>
                      ) : null}
                    </div>

                    {/*
                      Moving between the three stages, in one tap.
                      
                      It was already possible, but only inside "Notes, shruti
                      and status" — a disclosure most people would never open
                      for something they do several times a session. Sailavan
                      asked to be sure it was easy; behind a summary is not
                      easy.
                    */}
                    {canEdit ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {STAGES.map((stage) => (
                          <form
                            key={stage.kind}
                            action={async (fd) => {
                              "use server";
                              await upsertLearning(fd);
                            }}
                          >
                            {/* A move, not an add — see upsertLearning. */}
                            <input type="hidden" name="move" value="1" />
                            <input type="hidden" name="singerId" value={singerId} />
                            <input type="hidden" name="title" value={e.title} />
                            <input type="hidden" name="kind" value={stage.kind} />
                            <input type="hidden" name="note" value={e.note ?? ""} />
                            <input
                              type="hidden"
                              name="preferredPitch"
                              value={e.preferredPitch ?? ""}
                            />
                            <button
                              type="submit"
                              disabled={e.kind === stage.kind}
                              className={[
                                "h-7 rounded-full border px-2.5 text-[11px]",
                                e.kind === stage.kind
                                  ? "border-brass bg-brass/15 font-semibold text-on-surface"
                                  : "border-rule-surface bg-field text-on-surface-muted hover:border-brass/50 hover:text-on-surface",
                              ].join(" ")}
                            >
                              {stage.title}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : null}

                    {canEdit ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-on-surface-muted hover:text-on-surface">
                          Notes, shruti and status
                        </summary>
                        <form
                          action={async (fd) => {
                            "use server";
                            await upsertLearning(fd);
                          }}
                          className="mt-2 grid gap-2"
                        >
                          {/* Editing an entry that exists, not adding one. */}
                          <input type="hidden" name="move" value="1" />
                          <input type="hidden" name="singerId" value={singerId} />
                          <input type="hidden" name="title" value={e.title} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-on-surface-muted">Status</span>
                              <select
                                name="kind"
                                defaultValue={e.kind}
                                className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                              >
                                {STAGES.map((s) => (
                                  <option key={s.kind} value={s.kind}>
                                    {s.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1">
                              {/*
                                The suggestion sits ABOVE the field it is for, as
                                Sailavan asked, because it is the answer to the
                                question the field asks and reading it afterwards
                                is no use.

                                Offered as the first option as well as stated, so
                                taking it is one tap. Never PRE-SELECTED: a
                                pre-selected guess is saved by anybody who came
                                here to change the note, and then it is
                                indistinguishable from a decision.
                              */}
                              {hint ? (
                                <span className="text-[11px] text-on-surface-muted">
                                  {HINT_WORDS[hint.source]}:{" "}
                                  <span className="font-mono tabular text-on-surface">
                                    {hint.pitch}
                                  </span>
                                </span>
                              ) : null}
                              <span className="text-[11px] text-on-surface-muted">
                                Shruti you want
                              </span>
                              <select
                                name="preferredPitch"
                                defaultValue={e.preferredPitch ?? ""}
                                className="h-11 rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                              >
                                <option value="">—</option>
                                {hint?.pitch && hint.pitch !== e.preferredPitch ? (
                                  <optgroup label={HINT_WORDS[hint.source]}>
                                    <option value={hint.pitch}>{hint.pitch}</option>
                                  </optgroup>
                                ) : null}
                                <optgroup label="Every shruti">
                                  {labels.map((l) => (
                                    <option key={l.label} value={l.label}>
                                      {l.label}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </label>
                          </div>
                          <label className="grid gap-1">
                            <span className="text-[11px] text-on-surface-muted">Note</span>
                            <Textarea
                              name="note"
                              rows={3}
                              defaultValue={e.note ?? ""}
                              placeholder="What is tricky, where you heard it, who taught it…"
                            />
                          </label>
                          <div>
                            <Button type="submit" variant="primary" className="h-9 text-xs">
                              Save
                            </Button>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </div>
                  );
                })
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
