import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { openingLine } from "@/lib/songVerses";
import { Card, CardContent } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The song catalogue.
 *
 * Filtered on the server from a plain query rather than the masterlist's
 * tsvector machinery: there are a few hundred of these, not 3,613, and a GIN
 * index would be a moving part earning nothing.
 */
export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const role = await getRole();
  if (role === "viewer" && !can(role, "viewAllPages")) {
    return <NoAccess what="The song catalogue" role={role} />;
  }

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const songs = await prisma.song.findMany({
    where: query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { tradition: { contains: query, mode: "insensitive" } },
            { language: { contains: query, mode: "insensitive" } },
            { composer: { contains: query, mode: "insensitive" } },
            // The words themselves, which is how somebody finds a song they
            // can only half remember a line of.
            { verses: { some: { roman: { contains: query, mode: "insensitive" } } } },
            { verses: { some: { meaning: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      language: true,
      tradition: true,
      // Just the first verse, for the line the song is known by. `take: 1` on
      // the ordered relation rather than pulling every verse of every song to
      // read one line of one of them.
      verses: {
        orderBy: { order: "asc" },
        take: 1,
        select: { roman: true, script: true },
      },
      _count: { select: { verses: true, items: true } },
    },
  });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Songs</h1>
        <p className="mt-1 text-sm text-on-ground-muted">
          What the group sings at music programs, with the words and what they mean. Separate
          from the bhajan masterlist — these are the centre&apos;s own.
        </p>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Title, language, or a line you remember"
          aria-label="Search songs"
          className="h-9 min-w-0 flex-1 rounded-key border border-rule-surface bg-field px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-key border border-rule-surface px-3 text-sm hover:border-brass/50"
        >
          Search
        </button>
      </form>

      {songs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-on-surface-muted">
            {query ? `Nothing matches "${query}".` : "No songs yet. They arrive with a program."}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {songs.map((song) => {
            /*
             * WHAT THE SECOND LINE IS FOR: recognising the song.
             *
             * It was "tradition · language", which almost no song has, so every
             * row showed an em dash — a line of the layout spent saying nothing.
             * The opening line is the thing a singer knows a song by. Where
             * there are no words yet, tradition and language are still better
             * than a dash, and where there is neither the line simply goes.
             */
            const opening = openingLine(song.verses[0]);
            const secondary =
              opening ?? [song.tradition, song.language].filter(Boolean).join(" · ");
            const verses = song._count.verses;

            return (
              <li key={song.id}>
                <Link
                  href={`/songs/${song.id}`}
                  className="flex items-center gap-3 rounded-[14px] border border-card-edge bg-surface p-3 hover:border-brass/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-semibold">
                      {song.title}
                    </span>
                    {secondary ? (
                      <span className="block truncate text-sm text-on-surface-muted">
                        {secondary}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-on-surface-muted">
                    {verses > 0 ? `${verses} verse${verses === 1 ? "" : "s"}` : "no words yet"}
                    {song._count.items > 0 ? ` · sung ${song._count.items}×` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
