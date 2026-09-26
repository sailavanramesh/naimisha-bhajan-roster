import Link from "next/link";
import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { openingLine } from "@/lib/songVerses";
import { Card, CardContent } from "@/components/ui";
import { NewChant } from "@/components/NewChant";

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
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const role = await getRole();
  if (role === "viewer" && !can(role, "viewAllPages")) {
    return <NoAccess what="The song catalogue" role={role} />;
  }

  const { q, kind: kindParam } = await searchParams;
  const query = (q ?? "").trim();

  /*
   * WHICH LIST YOU ARE LOOKING AT.
   *
   * Songs and chants share a table (see SongKind in schema.prisma) but never
   * share a list: a singer looking for "Madhura Mohana" is not also looking for
   * an ashtottara. Songs are the default because they are the bigger catalogue
   * and the one people arrive here for.
   */
  const kind = kindParam === "chant" ? "chant" : "song";
  const isChants = kind === "chant";

  const songs = await prisma.song.findMany({
    where: {
      kind,
      ...(query
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
            // The Devanagari too, so searching in the script finds a chant.
            { verses: { some: { script: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
    },
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

  const canAdd = can(role, "editPrograms");

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">
          {isChants ? "Chants" : "Songs"}
        </h1>
        <p className="mt-1 text-sm text-on-ground-muted">
          {isChants
            ? "Chants, stotras and ashtottaras, in Devanagari and in transliteration. Recited rather than sung, so they carry no pitch and no practice track."
            : "What the group sings at music programs, with the words and what they mean. Separate from the bhajan masterlist — these are the centre's own."}
        </p>
      </div>

      {/*
        The two lists, as links rather than as a client-side toggle: which list
        you are on belongs in the URL, so it survives opening an entry and
        pressing back, and so a link to the chants can be sent to somebody.
      */}
      <nav className="flex gap-2" aria-label="Which catalogue">
        {[
          { key: "song", label: "Songs", href: "/songs" },
          { key: "chant", label: "Chants & stotras", href: "/songs?kind=chant" },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={kind === tab.key ? "page" : undefined}
            className={
              kind === tab.key
                ? "rounded-key border border-brass/50 bg-surface px-3 py-1.5 text-sm font-medium"
                : "rounded-key border border-rule-surface px-3 py-1.5 text-sm text-on-ground-muted hover:border-brass/50"
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap gap-2">
        {/* Searching must not drop you back into the songs. */}
        {isChants ? <input type="hidden" name="kind" value="chant" /> : null}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={
            isChants ? "Title, or a name you remember" : "Title, language, or a line you remember"
          }
          aria-label={isChants ? "Search chants" : "Search songs"}
          className="h-9 min-w-0 flex-1 rounded-key border border-rule-surface bg-field px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-key border border-rule-surface px-3 text-sm hover:border-brass/50"
        >
          Search
        </button>
      </form>

      {isChants && canAdd ? <NewChant /> : null}

      {songs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-on-surface-muted sm:py-6">
            {query
              ? `Nothing matches "${query}".`
              : isChants
                ? "No chants yet."
                : "No songs yet. They arrive with a program."}
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
                    {verses > 0
                      ? isChants
                        ? `${verses} part${verses === 1 ? "" : "s"}`
                        : `${verses} verse${verses === 1 ? "" : "s"}`
                      : "no words yet"}
                    {!isChants && song._count.items > 0 ? ` · sung ${song._count.items}×` : ""}
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
