import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { prisma } from "@/lib/db";
import { Gender } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ShrutiLadder } from "@/components/ShrutiLadder";
import { ShrutiPlayer } from "@/components/ShrutiPlayer";
import { DeitySymbols } from "@/components/DeitySymbol";
import {
  getPitchLabels,
  getAllProfiles,
  getScheduledRowsForBhajan,
  getSungRowsForBhajan,
} from "@/lib/pitchQueries";
import { predictForSinger } from "@/lib/singerProfile";
import { semitoneDelta } from "@/lib/pitch";
import { AddToList } from "@/components/AddToList";
import { PitchFinder } from "@/components/PitchFinder";
import { getRole, can, getSignedInSinger } from "@/lib/auth";
import { rosterable } from "@/lib/rosterEligibility";
import { EditBhajanPanel, EditedDot } from "./EditBhajanPanel";
import { TrackControl } from "@/components/TrackControl";
import { EDITABLE_FIELDS } from "@/lib/bhajanFields";

export const dynamic = "force-dynamic";

type BhajanLinks = {
  url: string | null;
  video: string | null;
  audio: string | null;
  tutorial: string | null;
  sheetMusic: string | null;
  karaokeTracksForPractice: string | null;
};

/** The first URL in a cell — a few hold several, whitespace separated. */
function firstUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/https?:\/\/[^\s,;]+/);
  return match ? match[0] : null;
}

function ResourceLinks({ bhajan }: { bhajan: BhajanLinks }) {
  const links: Array<{ href: string; label: string; note?: string }> = [];
  const add = (raw: string | null, label: string, note?: string) => {
    const href = firstUrl(raw);
    if (href) links.push({ href, label, note });
  };

  add(bhajan.url, "Sai Rhythms", "the song's page");
  add(bhajan.video, "Video", "YouTube");
  add(bhajan.audio, "Audio");
  add(bhajan.tutorial, "Tutorial");
  add(bhajan.sheetMusic, "Sheet music");
  add(bhajan.karaokeTracksForPractice, "Karaoke track");

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/[0.10] px-3 py-1.5 text-sm text-on-surface transition-colors hover:bg-brass/20"
        >
          {l.label}
          {l.note ? (
            <span className="text-[11px] text-on-surface-muted">{l.note}</span>
          ) : null}
          <span aria-hidden className="text-[11px] text-on-surface-muted">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
}

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
    include: {
      deities: { include: { deity: true } },
      // Through the join table, never the raw `songTags` string (CLAUDE.md).
      tags: { include: { tag: { select: { name: true } } } },
      // What the group has corrected, and what it replaced.
      fieldEdits: { select: { field: true, sourceValue: true, editedBy: true } },
    },
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
            <BackLink fallback="/bhajans" label="Back to Bhajans" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [sungRows, scheduled, profiles, rungs, singers, role, signedIn] = await Promise.all([
    getSungRowsForBhajan(bhajan.id),
    getScheduledRowsForBhajan(bhajan.id),
    getAllProfiles(),
    getPitchLabels(),
    prisma.singer.findMany({ orderBy: { name: "asc" } }),
    getRole(),
    getSignedInSinger(),
  ]);

  /*
   * Same rule as Explore: the picker only appears when the app cannot tell who
   * is asking, or when a coordinator is legitimately adding to someone else's
   * list. Signed in as yourself, the server already knows whose list it is.
   */
  const canAddToList = can(role, "manageOwnLearning");
  // The same permission that corrects a raga adds a recording: both change what
  // the masterlist says about this bhajan.
  const canEditBhajan = can(role, "addBhajan");
  const pickSinger = !signedIn || can(role, "assignSingers");
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

  /*
   * Everyone who has NOT sung it — this is where prediction earns its keep.
   *
   * Singers only. A prediction is a gender reference shifted by that person's
   * own median offset, and somebody with no recorded voice has neither: the
   * table was listing them with a bare reference and "0 records", which reads
   * as a prediction and is not one. They are users — mic operators,
   * instrumentalists who do not sing — and lib/rosterEligibility.ts is the
   * same rule that already keeps them off the roster and off /singers.
   *
   * They keep their list, though. Wanting to learn a bhajan is not the same
   * claim as being ready to be rostered for it.
   */
  const sungNames = new Set(sungRows.map((r) => r.singerName));
  const predictions = rosterable(singers)
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

  /*
   * What the signed-in singer should start from when finding their pitch.
   *
   * Their own saved pitch if they have one, else their prediction where there
   * is enough history to trust it, else the reference for their side. The
   * reason is passed through with it: a number nobody can account for is worse
   * than no number.
   */
  const mine = signedIn
    ? await prisma.singerRepertoire.findFirst({
        where: { singerId: signedIn.id, title: { equals: bhajan.title, mode: "insensitive" } },
        orderBy: { kind: "asc" },
        select: { preferredPitch: true },
      })
    : null;

  // getSignedInSinger returns identity and role, not the singer record, and
  // the reference to start from depends on which side they sing. The full list
  // is already loaded above, so take it from there rather than query again.
  const meRecord = signedIn ? (singers.find((x) => x.id === signedIn.id) ?? null) : null;
  const myReference = referenceFor(meRecord?.gender ?? null);
  const myPrediction = signedIn
    ? predictForSinger(profiles.get(signedIn.name), myReference, bhajan.raga, labelStrings)
    : null;

  const startPitch = myPrediction?.label ?? myReference ?? null;
  const startReason = !signedIn
    ? null
    : myPrediction?.predicted
      ? `what you usually sing, from ${myPrediction.n} recorded ${myPrediction.n === 1 ? "time" : "times"}`
      : myReference
        ? `the ${meRecord?.gender === Gender.Ladies ? "ladies" : "gents"} reference`
        : null;

  /** The group's correction to one field, if there is one. */
  const editOf = (field: string) => bhajan.fieldEdits.find((e) => e.field === field) ?? null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-start gap-3">
                <DeitySymbols deities={bhajan.deities.map((d) => d.deity.name)} size={22} className="mt-1" />
                <CardTitle>{bhajan.title}</CardTitle>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-on-surface-muted">
                <span>
                  {bhajan.raga ? `Raga: ${bhajan.raga}` : "Raga: —"}
                  {editOf("raga") ? (
                    <EditedDot field="raga" sourceValue={editOf("raga")!.sourceValue} />
                  ) : null}
                </span>
                {/* Deliberately quiet. The group should be able to tell its own
                    additions from the Sai Rhythms masterlist without the
                    distinction being shouted at them. */}
                {bhajan.origin === "local" ? (
                  <span
                    className="rounded-full border border-rule-surface px-2 py-0.5 text-[11px] text-on-surface-muted"
                    title={
                      bhajan.originNote
                        ? `Added by the group — ${bhajan.originNote}`
                        : "Added by the group, not from the Sai Rhythms masterlist"
                    }
                  >
                    added by the group
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {/* Back to wherever you came from — the list with its filters
                  still on, the half-built session, the singer's page. See
                  components/BackLink.tsx. */}
              <BackLink fallback="/bhajans" />
              {/* Reaching a bhajan from the roster or a search is at least as
                  common as browsing Explore, and wanting to learn it is the
                  same impulse in both places. */}
              {canAddToList ? (
                <AddToList
                  bhajanTitle={bhajan.title}
                  singers={pickSinger ? singers : []}
                />
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          {/* Links out. The masterlist carries a Sai Rhythms page for every
              bhajan, plus media for many — all of it was previously stored and
              never surfaced. Opened in a new tab so the roster is not lost. */}
          <ResourceLinks bhajan={bhajan} />

          {/*
            The bhajan's tags, and the only place in the app they are visible.
            Sailavan asked how to search by tag; the honest answer was that you
            could not, and that even once you could you would have no way to
            learn a tag's name. Each one is a link into the filtered list, so a
            tag is both an answer and a way to find more like it.
          */}
          {bhajan.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-on-surface-muted">Tags</span>
              {bhajan.tags
                .map((x) => x.tag.name)
                .sort((a, b) => a.localeCompare(b))
                .map((name) => (
                  <Link
                    key={name}
                    href={`/bhajans?tag=${encodeURIComponent(name)}`}
                    className="rounded-full border border-rule-surface px-2 py-0.5 text-[11px] text-on-surface-muted transition-colors hover:border-brass/50 hover:text-on-surface"
                  >
                    {name}
                  </Link>
                ))}
            </div>
          ) : null}

          {/*
            The group's OWN recording, to learn the bhajan from.
            Sailavan, 2026-08-21: "so people can listen to it and learn the
            bhajan."

            Below the links rather than among them, and deliberately not one of
            them: those go out to somebody else's site and can rot, this is a
            file the centre holds. Anybody signed in may listen; adding one needs
            the same permission as correcting anything else about a bhajan.

            The whole block is hidden when there is no recording and you cannot
            add one, so a member browsing the masterlist sees nothing about
            uploads.
          */}
          {bhajan.trackFile || canEditBhajan ? (
            <section className="grid gap-1.5 rounded-[12px] border border-rule-surface bg-panel p-3">
              <h2 className="text-xs font-semibold text-on-surface-muted">
                Recording
                {bhajan.trackUploadedBy ? (
                  <span className="ml-1 font-normal">· added by {bhajan.trackUploadedBy}</span>
                ) : null}
              </h2>
              <TrackControl
                endpoint={`/api/bhajans/${bhajan.id}/track`}
                initial={{
                  file: bhajan.trackFile,
                  name: bhajan.trackName,
                  bytes: bhajan.trackBytes,
                  uploadedBy: bhajan.trackUploadedBy,
                }}
                canEdit={canEditBhajan}
                addLabel="Add a recording"
              />
              {!bhajan.trackFile && canEditBhajan ? (
                <p className="text-[11px] text-on-surface-muted">
                  MP3, M4A, OGG or WAV, up to 30 MB. Kept on the app&rsquo;s own storage, which
                  has no backup — keep your copy.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[12px] border border-rule-surface bg-panel p-3">
              <div className="text-xs font-semibold text-on-surface-muted">Gents pitch</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm">
                {bhajan.referenceGentsPitch ?? "—"}
                <ShrutiPlayer label={bhajan.referenceGentsPitch} />
                {editOf("referenceGentsPitch") ? (
                  <EditedDot
                    field="referenceGentsPitch"
                    sourceValue={editOf("referenceGentsPitch")!.sourceValue}
                  />
                ) : null}
              </div>
            </div>

            <div className="rounded-[12px] border border-rule-surface bg-panel p-3">
              <div className="text-xs font-semibold text-on-surface-muted">Ladies pitch</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm">
                {bhajan.referenceLadiesPitch ?? "—"}
                <ShrutiPlayer label={bhajan.referenceLadiesPitch} />
                {editOf("referenceLadiesPitch") ? (
                  <EditedDot
                    field="referenceLadiesPitch"
                    sourceValue={editOf("referenceLadiesPitch")!.sourceValue}
                  />
                ) : null}
              </div>
            </div>

          {signedIn ? (
            <PitchFinder
              singerId={signedIn.id}
              title={bhajan.title}
              startPitch={startPitch}
              savedPitch={mine?.preferredPitch ?? null}
              startReason={startReason}
              options={labelStrings}
              canSave={canAddToList}
            />
          ) : null}
          </div>

          {/*
            Lyrics and meaning lead. This is what somebody opens a bhajan for —
            mid-session, on a phone, wanting the words. The pitch analysis is
            valuable, but it is reference, and it was pushing the words below
            three sections of tables.
          */}
          <section className="grid gap-3 md:grid-cols-2">
            <article className="rounded-[12px] border border-brass/25 bg-surface p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
                Lyrics
              </h2>
              <div className="mt-2 whitespace-pre-wrap text-[15px] leading-7">
                {bhajan.lyrics ?? (
                  <span className="text-on-surface-muted">Not recorded for this bhajan.</span>
                )}
              </div>
            </article>

            <article className="rounded-[12px] border border-brass/25 bg-surface p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
                Meaning
              </h2>
              <div className="mt-2 whitespace-pre-wrap text-[15px] leading-7">
                {bhajan.meaning ?? (
                  <span className="text-on-surface-muted">Not recorded for this bhajan.</span>
                )}
              </div>
            </article>
          </section>

          {can(role, "addBhajan") ? (
            <EditBhajanPanel
              bhajanId={bhajan.id}
              edits={bhajan.fieldEdits}
              values={Object.fromEntries(
                EDITABLE_FIELDS.map((f) => [
                  f.name,
                  (bhajan as unknown as Record<string, string | null>)[f.name] ?? null,
                ]),
              )}
            />
          ) : null}

          {/*
            COMING UP — the other side of the sung cutoff.

            "Sung" is evidence, and only counts two hours after a session has
            started. That is right, and on its own it left a bhajan already on
            next Thursday's roster looking like one nobody had ever touched:
            absent from the history because it had not happened, and mentioned
            nowhere else. Sailavan: it "shouldn't be left out, but can't be in
            known or sung already".

            So it is stated separately and in the future tense. Nothing here
            counts towards anybody's history, their profile, or their known
            list — it is a plan, and a plan that moves date moves between these
            two sections on its own, because both are computed from the date
            when the page is read.
          */}
          {scheduled.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">Scheduled to be sung</h2>
              <ul className="grid gap-1">
                {scheduled.map((r) => (
                  <li key={`${r.sessionId}-${r.singerName ?? ""}`} className="text-sm">
                    <Link
                      href={`/roster/${r.sessionId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {new Intl.DateTimeFormat("en-AU", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        timeZone: "UTC",
                      }).format(new Date(`${r.dateISO}T12:00:00.000Z`))}
                    </Link>
                    <span className="text-on-surface-muted">
                      {r.singerName ? ` · ${r.singerName}` : " · nobody rostered yet"}
                      {r.confirmedPitch ? ` · ${r.confirmedPitch}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Who has sung it */}
          <section className="grid gap-2">
            <h2 className="text-sm font-semibold">Who has sung this</h2>
            {sungBy.length === 0 ? (
              <p className="text-sm text-on-surface-muted">
                Nobody in the group has sung this yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[12px] border border-rule-surface">
                <table className="w-full text-sm">
                  <thead className="bg-panel text-left">
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
                          <span className="inline-flex items-center gap-1.5">
                            {r.confirmedPitch ?? "—"}
                            <ShrutiPlayer label={r.confirmedPitch} />
                          </span>
                        </td>
                        <td
                          className={r.delta ? "px-3 py-2 font-mono tabular font-semibold text-kumkum" : "px-3 py-2 font-mono tabular font-semibold"}
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
              <div className="overflow-x-auto rounded-[12px] border border-rule-surface">
                <table className="w-full text-sm">
                  <thead className="bg-panel text-left">
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
                          className={prediction.predicted ? "px-3 py-2 font-mono tabular text-kumkum" : "px-3 py-2 font-mono tabular"}
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
                raga={bhajan.raga}
              />
            </section>
          ) : null}

        </CardContent>
      </Card>
    </div>
  );
}
