import Link from "next/link";
import { prisma } from "@/lib/db";
import { Gender } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import { ShrutiLadder } from "@/components/ShrutiLadder";
import { getPitchLabels, getAllProfiles, getSungRowsForBhajan } from "@/lib/pitchQueries";
import { predictForSinger } from "@/lib/singerProfile";
import { semitoneDelta } from "@/lib/pitch";

export const dynamic = "force-dynamic";

function signed(n: number | null): string {
  if (n === null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

export default async function BhajanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const bhajan = await prisma.bhajan.findUnique({
    where: { id },
  });

  if (!bhajan) {
    return (
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Bhajan not found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-on-surface-muted mb-3">
              This bhajan may have been deleted or the link is incorrect.
            </div>
            <Link href="/bhajans">
              <Button>Back to Bhajans</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [sungRows, profiles, rungs, singers] = await Promise.all([
    getSungRowsForBhajan(bhajan.id),
    getAllProfiles(),
    getPitchLabels(),
    prisma.singer.findMany({ orderBy: { name: "asc" } }),
  ]);
  const labelStrings = rungs.map((r) => r.label);

  const referenceFor = (gender: Gender | null) =>
    gender === Gender.Ladies ? bhajan.referenceLadiesPitch : bhajan.referenceGentsPitch;

  // Who has sung it, most recent first, with how far off the reference they were.
  const sungBy = sungRows.map((r) => ({
    singerName: r.singerName,
    gender: r.gender,
    confirmedPitch: r.confirmedPitch,
    reference: r.historicalRecommendedPitch ?? r.masterlistReference,
    delta: semitoneDelta(r.confirmedPitch, r.historicalRecommendedPitch ?? r.masterlistReference),
    date: r.date,
  }));

  // Everyone who has NOT sung it — this is where prediction earns its keep.
  const sungNames = new Set(sungRows.map((r) => r.singerName));
  const predictions = singers
    .filter((s) => !sungNames.has(s.name))
    .map((s) => ({
      singer: s,
      prediction: predictForSinger(
        profiles.get(s.name),
        referenceFor(s.gender),
        bhajan.raga,
        labelStrings,
      ),
    }))
    .filter((p) => p.prediction.label !== null);

  const mostRecent = sungBy[0] ?? null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{bhajan.title}</CardTitle>
              <div className="mt-2 text-sm text-on-surface-muted">
                {bhajan.raga ? `Raga: ${bhajan.raga}` : "Raga: —"}
              </div>
            </div>

            <Link href="/bhajans">
              <Button>Back</Button>
            </Link>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-key border border-rule-surface bg-white/60 p-3">
              <div className="text-xs font-semibold text-on-surface-muted">Gents pitch</div>
              <div className="mt-1 text-sm">{bhajan.referenceGentsPitch ?? "—"}</div>
            </div>

            <div className="rounded-key border border-rule-surface bg-white/60 p-3">
              <div className="text-xs font-semibold text-on-surface-muted">Ladies pitch</div>
              <div className="mt-1 text-sm">{bhajan.referenceLadiesPitch ?? "—"}</div>
            </div>
          </div>

          {/* Who has sung it */}
          <section className="grid gap-2">
            <h2 className="text-sm font-semibold">Who has sung this</h2>
            {sungBy.length === 0 ? (
              <p className="text-sm text-on-surface-muted">
                Nobody in the group has sung this yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-key border border-rule-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunk text-left">
                    <tr className="border-b border-rule-surface">
                      <th className="px-3 py-2 font-semibold">Singer</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Sang at</th>
                      <th className="px-3 py-2 font-semibold">vs reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sungBy.map((r, i) => (
                      <tr key={`${r.singerName}-${i}`} className="border-b border-rule-surface last:border-b-0">
                        <td className="px-3 py-2">{r.singerName}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-xs text-on-surface-muted">
                          {r.date.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {r.confirmedPitch ?? "—"}
                        </td>
                        <td
                          className="px-3 py-2 font-mono tabular-nums font-semibold"
                          style={r.delta ? { color: "var(--kumkum)" } : undefined}
                        >
                          {signed(r.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Ladder for the most recent performance */}
          {mostRecent ? (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">
                Shruti ladder — {mostRecent.singerName},{" "}
                {mostRecent.date.toISOString().slice(0, 10)}
              </h2>
              <ShrutiLadder
                rungs={rungs}
                reference={mostRecent.reference}
                actual={mostRecent.confirmedPitch}
                actualKind="confirmed"
              />
            </section>
          ) : null}

          {/* Predictions for everyone else */}
          {predictions.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">
                Predicted pitch for singers who have not sung this
              </h2>
              <p className="text-xs text-on-surface-muted">
                Their gender reference shifted by their own median offset. Rows
                marked <em>reference only</em> have too little history to predict
                from, so the plain reference is shown instead.
              </p>
              <div className="overflow-x-auto rounded-key border border-rule-surface">
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunk text-left">
                    <tr className="border-b border-rule-surface">
                      <th className="px-3 py-2 font-semibold">Singer</th>
                      <th className="px-3 py-2 font-semibold">Pitch</th>
                      <th className="px-3 py-2 font-semibold">Shift</th>
                      <th className="px-3 py-2 font-semibold">Based on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.map(({ singer, prediction }) => (
                      <tr key={singer.id} className="border-b border-rule-surface last:border-b-0">
                        <td className="px-3 py-2">
                          <Link
                            href={`/singers/${singer.id}`}
                            className="underline underline-offset-2"
                          >
                            {singer.name}
                          </Link>
                        </td>
                        <td
                          className="px-3 py-2 font-mono tabular-nums"
                          style={prediction.predicted ? { color: "var(--kumkum)" } : undefined}
                        >
                          {/*
                            No comfort-range badge here on purpose. A
                            prediction is the singer's own median offset
                            applied to the reference, so it always falls
                            inside their band — the badge fired on most rows
                            and told the reader nothing. The flag belongs on
                            pitches a human proposes, which arrives with
                            overrides in Phase 3.
                          */}
                          {prediction.label}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {prediction.predicted ? signed(prediction.offset) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-on-surface-muted">
                          {prediction.predicted
                            ? `${prediction.n} records${prediction.basis === "raga" ? ", this raga" : ""}`
                            : `reference only (${prediction.n} records)`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-key border border-rule-surface bg-white/60 p-3">
              <div className="text-xs font-semibold text-on-surface-muted mb-2">Lyrics</div>
              <div className="text-sm whitespace-pre-wrap">{bhajan.lyrics ?? "—"}</div>
            </div>

            <div className="rounded-key border border-rule-surface bg-white/60 p-3">
              <div className="text-xs font-semibold text-on-surface-muted mb-2">Meaning</div>
              <div className="text-sm whitespace-pre-wrap">{bhajan.meaning ?? "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
