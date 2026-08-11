import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import { getSingerContexts, getSlotContexts, RECENT_WINDOW_DAYS } from "@/lib/rosterQueries";
import { assignRoster, DEFAULT_WEIGHTS, WEIGHT_GUIDE, type Weights } from "@/lib/rosterScoring";
import { applyAssignments, setAvailability } from "./actions";
import { AddSingerPanel } from "./AddSingerPanel";
import { buildSuggestions } from "./suggestions";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};

/** Pins arrive as `position:singerId` pairs, comma separated. */
function parsePins(raw: string | undefined): Map<number, string> {
  const out = new Map<number, string>();
  for (const part of (raw ?? "").split(",").filter(Boolean)) {
    const [pos, id] = part.split(":");
    const n = Number(pos);
    if (Number.isInteger(n) && id) out.set(n, id);
  }
  return out;
}
const serialisePins = (pins: Map<number, string>) =>
  [...pins.entries()].map(([p, id]) => `${p}:${id}`).join(",");

function weightsFrom(sp: SP): Weights {
  const num = (k: keyof Weights) => {
    const v = Number(one(sp, `w_${k}`));
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[k];
  };
  return {
    repertoire: num("repertoire"),
    overdue: num("overdue"),
    loadBalance: num("loadBalance"),
    pitchFit: num("pitchFit"),
    variety: num("variety"),
    genderClump: num("genderClump"),
  };
}

export default async function AssignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id: sessionId } = await params;
  const sp = await searchParams;

  /*
   * Who sings what is an editor's decision (lib/auth.ts: members hold
   * editSlotBhajan but not assignSingers).
   *
   * This page had NO gate at all. Every mutating action on it checks the
   * capability, so a member could not actually change anything — but the page
   * rendered in full, offering controls that would refuse on submit. A page
   * that shows you a job you are not allowed to do is its own kind of wrong,
   * and it only held because each action remembered to check for itself.
   */
  const role = await getRole();
  if (!can(role, "assignSingers")) {
    return <NoAccess what="Assigning singers" role={role} />;
  }

  /*
   * Four serial round trips to Azure — session, then singers+slots, then the
   * singer list, then the lineup — cost more than the work itself. Only
   * getSingerContexts genuinely depends on the session date, so everything
   * else goes in one wave.
   */
  const [session, slots, allSingers, lineupRows] = await Promise.all([
    prisma.session.findUnique({ where: { id: sessionId } }),
    getSlotContexts(sessionId),
    // Only people who can actually hold a slot (lib/rosterEligibility).
    prisma.singer.findMany({ where: { gender: { not: null } }, orderBy: { name: "asc" } }),
    prisma.sessionSlot.findMany({
      where: { sessionId },
      orderBy: [{ position: "asc" }],
      select: {
        id: true,
        position: true,
        bhajanTitle: true,
        confirmedPitch: true,
        bhajan: { select: { title: true } },
        singer: { select: { name: true } },
      },
    }),
  ]);
  if (!session) return <div>Not found</div>;

  const singers = await getSingerContexts(session.date);

  const dateKey = session.date.toISOString().slice(0, 10);
  const pins = parsePins(one(sp, "pin"));
  const weights = weightsFrom(sp);

  /*
   * A slot that already has a singer is pinned to them. Without this the
   * fairness pass proposed a fresh name for every slot, so adding three people
   * by hand and then looking at the panel below showed three DIFFERENT people
   * — it read as the app disagreeing with what you had just done. Explicit
   * pins from the URL still win, so "Choose someone else" keeps working.
   */
  const effectivePins = new Map<number, string>();
  for (const slot of slots) {
    if (slot.assignedSingerId) effectivePins.set(slot.position, slot.assignedSingerId);
  }
  for (const [position, singerId] of pins) effectivePins.set(position, singerId);

  const alreadyOn = new Set(
    slots.filter((s) => s.assignedSingerId).map((s) => s.position),
  );

  const result = assignRoster(singers, slots, { pins: effectivePins, weights });

  // Singer-first flow: ?add=<singerId> opens the suggestion panel for them.
  const addId = one(sp, "add") ?? null;
  const addSinger = addId ? allSingers.find((x) => x.id === addId) ?? null : null;
  // Who is already on, so the coordinator can see progress without leaving.
  const lineup = lineupRows
    .filter((x) => x.singer)
    .map((x) => ({
      slotId: x.id,
      position: x.position,
      singerName: x.singer!.name,
      bhajanTitle: x.bhajan?.title ?? x.bhajanTitle ?? null,
      hasConfirmedPitch: Boolean(x.confirmedPitch),
    }));

  const suggestionGroups = addSinger
    ? await buildSuggestions({
        sessionId,
        singerId: addSinger.id,
        singerName: addSinger.name,
        gender: addSinger.gender,
      })
    : [];

  const href = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const value = Array.isArray(v) ? v[0] : v;
      if (value) p.set(k, value);
    }
    for (const [k, v] of Object.entries(changes)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    return `/roster/${sessionId}/assign${qs ? `?${qs}` : ""}`;
  };

  const payload = result.assignments
    .filter((a) => a.singer)
    .map((a) => ({ position: a.position, singerId: a.singer!.id }));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a singer</CardTitle>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-muted">
            Start from the person rather than the slot. Add somebody straight away, or
            open their songs first — suggestions come from their own list and from
            bhajans musically close to it.
          </p>
        </CardHeader>
        <CardContent>
          <AddSingerPanel
            sessionId={sessionId}
            singers={allSingers.map((s) => ({ id: s.id, name: s.name, gender: s.gender }))}
            selected={addSinger ? { id: addSinger.id, name: addSinger.name } : null}
            groups={suggestionGroups}
            basePath={`/roster/${sessionId}/assign`}
            lineup={lineup}
            sessionDate={dateKey}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This session — {dateKey}</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            Slots marked <strong>already on</strong> are set. The rest are suggestions:
            nothing is written until you apply, and applying only sets the singer — it never
            touches a confirmed pitch.
          </div>
          <div className="mt-2">
            <Link href={`/roster/${sessionId}`} className="text-sm underline underline-offset-2">
              Back to the session
            </Link>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          {slots.length === 0 ? (
            <p className="text-sm text-on-surface-muted">
              This session has no slots yet. Build one on the{" "}
              <Link href="/build" className="underline underline-offset-2">
                Build
              </Link>{" "}
              page first.
            </p>
          ) : (
            <>
              {result.warnings.length > 0 ? (
                <div className="rounded-[12px] border border-warn/60 bg-warn/10 p-3">
                  <div className="text-sm font-semibold">Worth knowing</div>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <ol className="grid gap-2">
                {result.assignments.map((a) => {
                  const nextPins = new Map(pins);
                  if (a.pinned) nextPins.delete(a.position);
                  else if (a.singer) nextPins.set(a.position, a.singer.id);

                  return (
                    <li key={a.position} className="rounded-[12px] border border-rule-surface bg-panel p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-on-surface-muted">
                              {String(a.position).padStart(2, "0")}
                            </span>
                            {a.pinned && !alreadyOn.has(a.position) ? (
                              <span className="rounded-full border px-2 py-0.5 text-[10px]">
                                pinned
                              </span>
                            ) : null}
                            {/* Distinguishes what is already true from what is
                                merely proposed. Without it, a session you had
                                just filled by hand looked identical to one the
                                assigner had invented. */}
                            {alreadyOn.has(a.position) ? (
                              <span className="rounded-full border border-brass/50 bg-brass/[0.08] px-2 py-0.5 text-[10px] font-semibold text-brass-ink">
                                already on
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 font-medium">
                            {a.singer ? a.singer.name : "— nobody available —"}
                            {a.singer?.gender ? (
                              <span className="ml-2 text-xs font-normal text-on-surface-muted">
                                {a.singer.gender}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm text-on-surface-muted">
                            {a.slot.bhajanTitle ?? "no bhajan chosen"}
                          </div>
                          <div className="mt-1 text-xs" style={{ color: "rgb(var(--muted))" }}>
                            {/* "Pinned by you" is untrue of a slot that was
                                already rostered — it was pinned by the fact
                                that somebody is on it. */}
                            {(alreadyOn.has(a.position)
                              ? ["already rostered", ...a.reasons.filter((r) => !/pinned by you/i.test(r))]
                              : a.reasons
                            ).join(" · ")}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1">
                          {a.singer ? (
                            <Link href={href({ pin: serialisePins(nextPins) || undefined })}>
                              <Button type="button" className="w-full text-xs">
                                {a.pinned ? "Unpin" : "Pin"}
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                      </div>

                      {/* Manual override: pin anyone directly. */}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-on-surface-muted">
                          Choose someone else
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {singers.map((s) => {
                            const m = new Map(pins);
                            m.set(a.position, s.id);
                            return (
                              <Link key={s.id} href={href({ pin: serialisePins(m) })}>
                                <span className="rounded-full border px-2 py-1 text-xs hover:bg-panel-hover">
                                  {s.name}
                                  {!s.available ? " (unavailable)" : ""}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>

              {payload.length > 0 ? (
                <form action={applyAssignments}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="assignments" value={JSON.stringify(payload)} />
                  <Button type="submit" variant="primary">
                    Apply these singers
                  </Button>
                </form>
              ) : null}
            </>
          )}

          {/* Weights */}
          <details className="rounded-[12px] border border-rule-surface bg-panel">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
              Scoring weights
            </summary>
            {/*
              Outside the grid on purpose. As a grid item this paragraph took
              one narrow column and, because grid items stretch, forced every
              weight card to its height — the panel came out unreadable.
            */}
            <p className="px-4 pb-3 text-xs text-on-surface-muted">
              Each singer scores 0–1 on every line below; the weights decide how much each
              line counts. <strong>0 turns a consideration off entirely.</strong> Doubling a
              weight makes that consideration twice as decisive relative to the others — only
              the ratios matter, so raising all six changes nothing.
            </p>
            <form
              method="get"
              className="grid items-start gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              <input type="hidden" name="pin" value={serialisePins(pins)} />
              {(Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]).map((k) => {
                const guide = WEIGHT_GUIDE[k];
                const changed = weights[k] !== DEFAULT_WEIGHTS[k];
                return (
                  <label key={k} className="grid gap-1 rounded-[10px] border border-rule-surface bg-surface p-3">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">{guide.label}</span>
                      {guide.penalty ? (
                        <span className="rounded-full border border-warn/40 bg-warn/[0.08] px-1.5 py-0.5 text-[10px] font-semibold">
                          penalty
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-on-surface-muted">{guide.effect}</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        name={`w_${k}`}
                        defaultValue={weights[k]}
                        className="h-9 w-20 rounded-[10px] border px-2 text-sm"
                      />
                      <span className="text-[11px] text-on-surface-muted">
                        {changed ? (
                          <>
                            default {DEFAULT_WEIGHTS[k]} ·{" "}
                            <strong className="text-brass-ink">changed</strong>
                          </>
                        ) : (
                          <>default {DEFAULT_WEIGHTS[k]}</>
                        )}
                      </span>
                    </span>
                    <span className="text-[11px] leading-snug text-on-surface-muted">
                      {guide.detail}
                    </span>
                  </label>
                );
              })}
              <div className="flex gap-2 sm:col-span-2 xl:col-span-3">
                <Button type="submit">Re-score</Button>
                <Link href={href({ w_repertoire: undefined, w_overdue: undefined, w_loadBalance: undefined, w_pitchFit: undefined, w_variety: undefined, w_genderClump: undefined })}>
                  <Button type="button">Reset</Button>
                </Link>
              </div>
              <p className="text-xs text-on-surface-muted sm:col-span-2 xl:col-span-3">
                {/* The normalisation note moved to the intro above; what is worth
                    keeping here is why the defaults are set the way they are. */}
                Sharing the singing is weighted above knowing the bhajan on purpose: the
                point of the defaults is to stop the same few people singing every week.
              </p>
            </form>
          </details>

          {/* Availability */}
          <details className="rounded-[12px] border border-rule-surface bg-panel">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
              Availability for {dateKey}
            </summary>
            <div className="grid gap-2 px-4 pb-4">
              {singers.map((s) => (
                <form key={s.id} action={setAvailability} className="flex items-center gap-2">
                  <input type="hidden" name="singerId" value={s.id} />
                  <input type="hidden" name="date" value={dateKey} />
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="available" value={s.available ? "0" : "1"} />
                  <span className="w-28 text-sm">{s.name}</span>
                  <span className="text-xs text-on-surface-muted">
                    {s.recentCount} in the last {RECENT_WINDOW_DAYS} days
                  </span>
                  <Button type="submit" className="ml-auto text-xs">
                    {s.available ? "Mark unavailable" : "Mark available"}
                  </Button>
                </form>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
