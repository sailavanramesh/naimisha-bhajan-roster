import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import { getSingerContexts, getSlotContexts, RECENT_WINDOW_DAYS } from "@/lib/rosterQueries";
import { assignRoster, DEFAULT_WEIGHTS, type Weights } from "@/lib/rosterScoring";
import { applyAssignments, setAvailability } from "./actions";

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

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return <div>Not found</div>;

  const dateKey = session.date.toISOString().slice(0, 10);
  const pins = parsePins(one(sp, "pin"));
  const weights = weightsFrom(sp);

  const [singers, slots] = await Promise.all([
    getSingerContexts(session.date),
    getSlotContexts(sessionId),
  ]);

  const result = assignRoster(singers, slots, { pins, weights });

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
          <CardTitle>Assign singers — {dateKey}</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            Suggestions only. Nothing is written until you apply, and applying only sets the
            singer — it never touches a confirmed pitch.
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
                <div className="rounded-key border border-warn/60 bg-warn/10 p-3">
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
                    <li key={a.position} className="rounded-key border border-rule-surface bg-white/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-on-surface-muted">
                              {String(a.position).padStart(2, "0")}
                            </span>
                            {a.pinned ? (
                              <span className="rounded-full border px-2 py-0.5 text-[10px]">
                                pinned
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
                            {a.reasons.join(" · ")}
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
                                <span className="rounded-full border px-2 py-1 text-xs hover:bg-surface-sunk">
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
                  <Button type="submit" className="bg-black text-white hover:bg-black/90">
                    Apply these singers
                  </Button>
                </form>
              ) : null}
            </>
          )}

          {/* Weights */}
          <details className="rounded-key border border-rule-surface bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
              Scoring weights
            </summary>
            <form method="get" className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
              <input type="hidden" name="pin" value={serialisePins(pins)} />
              {(Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]).map((k) => (
                <label key={k} className="grid gap-1">
                  <span className="text-xs font-semibold text-on-surface-muted">{k}</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    name={`w_${k}`}
                    defaultValue={weights[k]}
                    className="h-10 w-full rounded-key border px-3 text-sm"
                  />
                </label>
              ))}
              <div className="sm:col-span-3 flex gap-2">
                <Button type="submit">Re-score</Button>
                <Link href={href({ w_repertoire: undefined, w_overdue: undefined, w_loadBalance: undefined, w_pitchFit: undefined, w_variety: undefined, w_genderClump: undefined })}>
                  <Button type="button">Reset</Button>
                </Link>
              </div>
              <p className="text-xs text-on-surface-muted sm:col-span-3">
                Every component is normalised to 0–1 before weighting, so these numbers are
                directly comparable. Load balance is weighted above repertoire on purpose:
                the point is to stop the same few people singing every week.
              </p>
            </form>
          </details>

          {/* Availability */}
          <details className="rounded-key border border-rule-surface bg-white">
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
