import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { prisma } from "@/lib/db";
import { getRole, can, canWithGrantsFor } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { performersLabel } from "@/lib/program";
import { Verses } from "@/components/Verses";
import { VerseEditor } from "@/components/VerseEditor";
import { TrackControl } from "@/components/TrackControl";
import { PracticePlayer } from "@/components/PracticePlayer";
import { cn } from "@/components/ui";
import { pairOf } from "@/lib/songTracks";
import { trackStorageSummary } from "@/lib/trackStore";

export const dynamic = "force-dynamic";

/**
 * One song: the words, what they mean, and every time the group has sung it.
 *
 * The "sung at" list is the reason the catalogue exists. Sailavan: songs
 * "should be catalogued and searchable, pitch tracked, singers marked, so that
 * they can easily be found again, recycled". A Doc could hold the lyrics; it
 * could never answer "what did we sing this at last time, and who sang it".
 */
export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  if (role === "viewer" && !can(role, "viewAllPages")) {
    return <NoAccess what="This song" role={role} />;
  }

  const song = await prisma.song.findUnique({
    where: { id },
    include: {
      verses: { orderBy: { order: "asc" } },
      bhajan: { select: { id: true, title: true } },
      deities: { include: { deity: { select: { name: true } } } },
      items: {
        orderBy: { session: { date: "desc" } },
        include: {
          session: {
            select: { id: true, date: true, topic: true, category: { select: { name: true } } },
          },
          performers: {
            orderBy: { order: "asc" },
            include: { singer: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!song) {
    return (
      <div className="rounded-[14px] border border-card-edge bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">Not found</h1>
      </div>
    );
  }

  // Words editing is the one thing a named person can be given on its own.
  const canEditWords = await canWithGrantsFor("editSongWords");
  /*
   * Uploading audio is gated on `editPrograms`, which already governs the
   * programme-item upload — the only precedent for putting a file on this disk.
   * Deliberately NOT the editSongWords grant: that exists so named people can
   * keep the lyrics current without other editor power, and spending the shared
   * storage allowance is a different thing from typing a verse.
   */
  const canEditTracks = can(role, "editPrograms");
  const pair = pairOf(song);
  const storage = canEditTracks ? await trackStorageSummary() : null;

  const facts = [song.language, song.tradition, song.composer].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-on-ground-muted">Song</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{song.title}</h1>
          {facts ? <p className="mt-0.5 text-sm text-on-ground-muted">{facts}</p> : null}
        </div>
        {/*
          Back to wherever you came from — the programme that sings this song,
          or the song list. Sailavan: "if I go into a song's lyrics from a
          program, when I go back it should go to the program."

          It said "All songs", which is a destination rather than a way back, so
          arriving from a programme and pressing it landed you in the catalogue
          with the running order lost. Same component and same reasoning as the
          bhajan page; the list is still one tap away in the sidebar.
        */}
        <BackLink fallback="/songs" label="Back" className="h-9 text-sm" />
      </div>

      {song.referenceUrl || song.bhajan ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {song.referenceUrl ? (
            <a
              href={song.referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brass-ink underline underline-offset-2"
            >
              Recording ↗
            </a>
          ) : null}
          {song.bhajan ? (
            <Link
              href={`/bhajans/${song.bhajan.id}`}
              className="text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
            >
              Also in the bhajan masterlist →
            </Link>
          ) : null}
        </div>
      ) : null}

      {/*
        The practice pair, and the toggle that drops the voice in and out.

        Sailavan, 2026-08-21: "i need it not in the bhajans but in the songs
        section, for the tracks we upload there." It sits above the words on
        purpose — somebody practising has the recording going while they read.

        Above "Sung at" too, because that list is history and this is the thing
        you came to use.
      */}
      {pair.original || pair.karaoke || canEditTracks ? (
        <Card>
          <CardHeader>
            <CardTitle>Recording</CardTitle>
            <p className="mt-1 text-sm text-on-surface-muted">
              {pair.original && pair.karaoke
                ? "The sung recording and the same one without the voice. The switch swaps them without losing your place, so a line can be heard and then sung."
                : pair.original
                  ? "Add the same recording with the voice taken out and a switch appears here, for practising."
                  : "The recording the group learns this from, kept by the centre rather than linked to somebody else's site."}
            </p>
          </CardHeader>
          <CardContent className="grid gap-2">
            {pair.original && pair.karaoke ? (
              <PracticePlayer
                original={{ file: pair.original.file, name: pair.original.name }}
                karaoke={{ file: pair.karaoke.file, name: pair.karaoke.name }}
              />
            ) : null}

            <div className={cn("grid gap-2", canEditTracks && "sm:grid-cols-2")}>
              <div className="grid gap-1">
                {pair.original && pair.karaoke ? (
                  <span className="text-[10px] uppercase tracking-wide text-on-surface-muted">
                    Sung recording
                  </span>
                ) : null}
                <TrackControl
                  endpoint={`/api/songs/${song.id}/track`}
                  initial={{
                    file: song.trackFile,
                    name: song.trackName,
                    bytes: song.trackBytes,
                    uploadedBy: song.trackUploadedBy,
                  }}
                  canEdit={canEditTracks}
                  addLabel="Add a recording"
                  playerHidden={Boolean(pair.original && pair.karaoke)}
                />
              </div>

              {/* Only once there is a recording to pair it with: a karaoke on
                  its own is not a practice pair. */}
              {pair.original || pair.karaoke ? (
                <div className="grid gap-1">
                  {pair.original && pair.karaoke ? (
                    <span className="text-[10px] uppercase tracking-wide text-on-surface-muted">
                      Karaoke, same recording
                    </span>
                  ) : null}
                  <TrackControl
                    endpoint={`/api/songs/${song.id}/track?kind=karaoke`}
                    initial={{
                      file: song.karaokeTrackFile,
                      name: song.karaokeTrackName,
                      bytes: song.karaokeTrackBytes,
                      uploadedBy: song.karaokeTrackUploadedBy,
                    }}
                    canEdit={canEditTracks}
                    addLabel="Add the karaoke version"
                    playerHidden={Boolean(pair.original && pair.karaoke)}
                  />
                </div>
              ) : null}
            </div>

            {canEditTracks ? (
              <p className="text-[11px] text-on-surface-muted">
                MP3, M4A, OGG or WAV, up to 30 MB. A programme item with no recording of its
                own will play this pair, so uploading it once is enough.{" "}
                Kept on the app&rsquo;s own storage, which has no backup — keep your copy.
                {storage ? (
                  <>
                    {" "}
                    <span className={storage.tight ? "text-warn" : undefined}>
                      {storage.usedLabel} of {storage.budgetLabel} of track storage used
                      {storage.tight ? " — getting tight" : ""}.
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Words</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Verses
            verses={song.verses.map((v) => ({
              id: v.id,
              label: v.label,
              script: v.script,
              roman: v.roman,
              meaning: v.meaning,
            }))}
          />
          <VerseEditor
            songId={song.id}
            canEdit={canEditWords}
            verses={song.verses.map((v) => ({
              id: v.id,
              label: v.label,
              script: v.script,
              roman: v.roman,
              meaning: v.meaning,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sung at</CardTitle>
          <p className="mt-1 text-sm text-on-surface-muted">
            Every program this has been in, with the pitch it was sung at and who sang it.
          </p>
        </CardHeader>
        <CardContent>
          {song.items.length === 0 ? (
            <p className="text-sm text-on-surface-muted">Not in a program yet.</p>
          ) : (
            <ul className="grid gap-2">
              {song.items.map((item) => {
                const when = new Intl.DateTimeFormat("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(item.session.date);
                const who = performersLabel(
                  item.performers.map((p) => ({
                    singerName: p.singer?.name ?? null,
                    name: p.name,
                    part: p.part,
                  })),
                );
                return (
                  <li key={item.id} className="text-sm">
                    <Link
                      href={`/program/${item.session.id}`}
                      className="text-brass-ink underline underline-offset-2"
                    >
                      {item.session.topic?.trim() || item.session.category?.name || "Music program"}
                    </Link>
                    <span className="text-on-surface-muted">
                      {" · "}
                      {when}
                      {item.pitchNote ? ` · ${item.pitchNote}` : ""}
                      {who ? ` · ${who}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
