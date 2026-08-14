import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRole, can, canWithGrantsFor } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { performersLabel } from "@/lib/program";
import { Verses } from "./Verses";
import { VerseEditor } from "./VerseEditor";

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

  const facts = [song.language, song.tradition, song.composer].filter(Boolean).join(" · ");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-on-ground-muted">Song</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{song.title}</h1>
          {facts ? <p className="mt-0.5 text-sm text-on-ground-muted">{facts}</p> : null}
        </div>
        <Link
          href="/songs"
          className="text-sm text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
        >
          All songs
        </Link>
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
