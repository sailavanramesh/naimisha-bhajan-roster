import Link from "next/link";
import { Gender } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { getPitchLabels, getAllProfiles } from "@/lib/pitchQueries";
import { predictForSinger } from "@/lib/singerProfile";
import { PitchFinder } from "@/components/PitchFinder";
import { ShrutiPlayer } from "@/components/ShrutiPlayer";
import { BhajanPicker } from "./BhajanPicker";

export const dynamic = "force-dynamic";

/**
 * Work out the pitch you sing things at, several in a sitting.
 *
 * The bhajan page carries the same finder for one bhajan at a time; this is for
 * sitting down with a tanpura and going through a few. It exists because a
 * member cannot open a roster, and the roster grid was the only place in the
 * app where a shruti could be heard and stepped.
 *
 * Everything it can save already had a home: `SingerRepertoire.preferredPitch`,
 * which `lib/suggestedPitch.ts` hands the rosterer as "saved". Nothing new is
 * stored and nobody has to copy anything across.
 */
export default async function FindMyPitchPage({
  searchParams,
}: {
  searchParams: Promise<{ bhajan?: string }>;
}) {
  const { bhajan: bhajanId } = await searchParams;
  const [role, signedIn, rungs] = await Promise.all([
    getRole(),
    getSignedInSinger(),
    getPitchLabels(),
  ]);

  if (!signedIn) {
    return (
      <div className="py-6">
        <Card>
          <CardHeader>
            <CardTitle>Find your pitch</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-on-surface-muted">
              This works out the pitch <em>you</em> sing a bhajan at, so it needs to know who you
              are. <Link href="/signin" className="underline">Sign in</Link> and come back.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const labelStrings = rungs.map((r) => r.label);
  const canSave = can(role, "manageOwnLearning");

  const [me, saved, chosen, profiles] = await Promise.all([
    prisma.singer.findUnique({ where: { id: signedIn.id }, select: { gender: true, name: true } }),
    prisma.singerRepertoire.findMany({
      where: { singerId: signedIn.id, preferredPitch: { not: null } },
      orderBy: { title: "asc" },
      select: { id: true, title: true, preferredPitch: true, bhajanId: true },
    }),
    bhajanId
      ? prisma.bhajan.findUnique({
          where: { id: bhajanId },
          select: {
            id: true,
            title: true,
            raga: true,
            referenceGentsPitch: true,
            referenceLadiesPitch: true,
          },
        })
      : Promise.resolve(null),
    getAllProfiles(),
  ]);

  // Their saved pitch for the chosen bhajan, and where to start if there is none.
  const mine = chosen
    ? (saved.find((s: (typeof saved)[number]) => s.title.toLowerCase() === chosen.title.toLowerCase()) ?? null)
    : null;

  const reference = chosen
    ? me?.gender === Gender.Ladies
      ? chosen.referenceLadiesPitch
      : chosen.referenceGentsPitch
    : null;

  const prediction =
    chosen && me
      ? predictForSinger(profiles.get(me.name), reference, chosen.raga, labelStrings)
      : null;

  const startReason = prediction?.predicted
    ? `what you usually sing, from ${prediction.n} recorded ${prediction.n === 1 ? "time" : "times"}`
    : reference
      ? `the ${me?.gender === Gender.Ladies ? "ladies" : "gents"} reference`
      : null;

  return (
    <div className="grid gap-4 py-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Find your pitch</h1>
        <p className="mt-1 text-sm text-on-surface-muted">
          Play the tanpura, step it until it sits where you sing, and keep it. What you keep is
          what the rosterer sees against your name.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 py-5 sm:py-6">
          <BhajanPicker currentId={chosen?.id ?? null} />

          {chosen ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="font-display text-lg font-semibold">{chosen.title}</h2>
                {chosen.raga ? (
                  <span className="text-xs text-on-surface-muted">Raga: {chosen.raga}</span>
                ) : null}
                <Link
                  href={`/bhajans/${chosen.id}`}
                  className="text-[11px] text-on-surface-muted underline hover:text-on-surface"
                >
                  the bhajan&rsquo;s page
                </Link>
              </div>

              <PitchFinder
                singerId={signedIn.id}
                title={chosen.title}
                startPitch={prediction?.label ?? reference ?? null}
                savedPitch={mine?.preferredPitch ?? null}
                startReason={startReason}
                options={labelStrings}
                canSave={canSave}
              />
            </div>
          ) : (
            <p className="text-[11px] text-on-surface-muted">
              Pick a bhajan above to hear a shruti against it.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pitches you have kept</CardTitle>
        </CardHeader>
        <CardContent>
          {saved.length === 0 ? (
            <p className="text-sm text-on-surface-muted">
              None yet. Anything you keep above shows here, and on your list.
            </p>
          ) : (
            <ul className="grid gap-1">
              {saved.map((s: (typeof saved)[number]) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-rule-surface px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-sm">
                    {s.bhajanId ? (
                      <Link href={`/find-my-pitch?bhajan=${s.bhajanId}`} className="hover:underline">
                        {s.title}
                      </Link>
                    ) : (
                      s.title
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm">
                    {s.preferredPitch}
                    <ShrutiPlayer label={s.preferredPitch} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
