import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ShrutiLadder } from "@/components/ShrutiLadder";
import { getPitchLabels, getSingerProfile } from "@/lib/pitchQueries";
import { referenceFor, offsetFor, MIN_RAGA_SAMPLES } from "@/lib/singerProfile";
import { isConfident, MIN_CONFIDENT_SAMPLES } from "@/lib/pitch";

export const dynamic = "force-dynamic";

function signed(n: number | null): string {
  if (n === null) return "—";
  const rounded = Math.round(n * 100) / 100;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export default async function SingerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const singer = await prisma.singer.findUnique({ where: { id } });
  if (!singer) return <div>Not found</div>;

  const [{ profile, rows }, rungs] = await Promise.all([
    getSingerProfile(singer.id, singer.name),
    getPitchLabels(),
  ]);

  const history = await prisma.sessionSlot.findMany({
    where: { singerId: singer.id },
    orderBy: { session: { date: "desc" } },
    take: 50,
    include: { session: true, bhajan: true },
  });

  const confident = isConfident(profile.overall);
  // The most recent row that produced a usable offset — the ladder needs a
  // concrete reference/actual pair to show, and the latest is the most useful.
  const latest = rows.find((r) => offsetFor(r) !== null) ?? null;

  const ragaRows = [...profile.byRaga.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{singer.name}</CardTitle>
          <div className="mt-2 text-sm text-gray-600">
            {singer.gender ?? "Gender not recorded"} · {profile.overall.n} sung{" "}
            {profile.overall.n === 1 ? "record" : "records"} with a usable pitch
          </div>
        </CardHeader>

        <CardContent className="grid gap-6">
          {/* Offset profile */}
          <section className="grid gap-2">
            <h2 className="text-sm font-semibold">Pitch offset</h2>
            {profile.overall.n === 0 ? (
              <p className="text-sm text-gray-600">
                No confirmed pitches recorded yet, so there is nothing to learn from.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Median" value={signed(profile.overall.median)} accent />
                  <Stat label="Mean" value={signed(profile.overall.mean)} />
                  <Stat label="Records" value={String(profile.overall.n)} />
                  <Stat
                    label="Comfort (Sa)"
                    value={
                      profile.comfort
                        ? `${profile.comfort.lowNote}–${profile.comfort.highNote}`
                        : "—"
                    }
                  />
                </div>
                <p className="text-sm text-gray-700">
                  {confident ? (
                    <>
                      Against the reference for {singer.gender ?? "their"} voice,{" "}
                      {singer.name} sits at a median of{" "}
                      <strong style={{ color: "var(--kumkum)" }}>
                        {signed(profile.overall.median)}
                      </strong>{" "}
                      semitones across {profile.overall.n} records.
                    </>
                  ) : (
                    <>
                      Only {profile.overall.n} record
                      {profile.overall.n === 1 ? "" : "s"} — fewer than{" "}
                      {MIN_CONFIDENT_SAMPLES}, so the plain reference is shown rather
                      than a prediction.
                    </>
                  )}
                </p>
              </>
            )}
          </section>

          {/* Shruti ladder */}
          {latest ? (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">
                Shruti ladder — most recent sung bhajan
              </h2>
              <div className="text-sm text-gray-600">
                {latest.bhajanTitle ?? "—"} ·{" "}
                {latest.date.toISOString().slice(0, 10)}
              </div>
              <ShrutiLadder
                rungs={rungs}
                reference={referenceFor(latest)}
                actual={latest.confirmedPitch}
                actualKind="confirmed"
                comfort={profile.comfort}
              />
            </section>
          ) : null}

          {/* Per-raga */}
          {ragaRows.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">By raga</h2>
              <p className="text-xs text-gray-600">
                Only ragas with at least {MIN_RAGA_SAMPLES} records are shown.
              </p>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-semibold">Raga</th>
                      <th className="px-3 py-2 font-semibold">n</th>
                      <th className="px-3 py-2 font-semibold">Median</th>
                      <th className="px-3 py-2 font-semibold">Mean</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ragaRows.map(([raga, p]) => (
                      <tr key={raga} className="border-b last:border-b-0">
                        <td className="px-3 py-2">{raga}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{p.n}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {signed(p.median)}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {signed(p.mean)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent history</CardTitle>
          <div className="mt-2 text-sm text-gray-600">Latest 50.</div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {history.map((h) => (
              <Link
                key={h.id}
                href={`/roster/${h.sessionId}`}
                className="rounded-xl border bg-white p-3 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-black/20"
              >
                <div className="text-sm font-medium">
                  {new Date(h.session.date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {h.bhajanTitle ?? h.festivalBhajanTitle ?? "—"}
                </div>
                {h.confirmedPitch ? (
                  <div className="mt-1 font-mono text-xs tabular-nums text-gray-600">
                    {h.confirmedPitch}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white px-3 py-2">
      <div className="text-xs text-gray-600">{label}</div>
      <div
        className="font-mono text-lg tabular-nums font-semibold"
        style={accent ? { color: "var(--kumkum)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
