import { Suspense } from "react";
import Link from "next/link";
import { KeepScroll } from "@/components/KeepScroll";
import { Button } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { Marked } from "@/components/Marked";
import { firstMatch, matches } from "@/lib/highlight";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function BhajansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deity?: string; lang?: string; tag?: string }>;
}) {
  const sp = await searchParams;

  const q = (sp?.q ?? "").trim();
  const deity = (sp?.deity ?? "").trim();
  const lang = (sp?.lang ?? "").trim();
  const tag = (sp?.tag ?? "").trim();

  // Build filter
  const where: Prisma.BhajanWhereInput = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { lyrics: { contains: q, mode: "insensitive" } },
      { meaning: { contains: q, mode: "insensitive" } },
      { raga: { contains: q, mode: "insensitive" } },
      { composer: { contains: q, mode: "insensitive" } },
      // Typing "karaoke" should find the karaoke ones without having to know
      // there is a dropdown for it. Matched through the join table, never
      // against the raw `songTags` string — see CLAUDE.md on multi-values.
      { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  if (deity) where.deities = { some: { deity: { name: deity } } };
  /*
   * Same condensation as the deities. `language` is a comma-joined string —
   * "English, Sanskrit / Hindi, Spanish, Telugu" — so an exact match offered
   * dozens of unusable combinations. Matching on containment means a bhajan in
   * several languages appears under each of them, which is what you want.
   *
   * Unlike deities there is no join table for language, so this is done at
   * query time. Normalising it properly is logged in PROGRESS.md.
   */
  if (lang) where.language = { contains: lang, mode: "insensitive" };
  /*
   * Tags come from the masterlist's `song_tags` column, normalised into Tag and
   * BhajanTag at seed time: 49 tags over 3,212 links. An exact name here, not a
   * containment match, because the dropdown offers real tag names — and
   * "music" would otherwise sweep up both `sheet-music` and `lead-music`.
   */
  if (tag) where.tags = { some: { tag: { name: tag } } };

  const [items, deities, langs, tags] = await Promise.all([
    prisma.bhajan.findMany({
      where,
      orderBy: { title: "asc" },
      take: 500,
      include: {
        deities: { include: { deity: true } },
        // Needed to say "tag: karaoke" under a row that matched on one.
        tags: { include: { tag: { select: { name: true } } } },
      },
    }),
    // The raw `deity` column holds combined strings like
    // "Ganesha, Rama, Krishna, Vittala, Subrahmanya, Guru", so a distinct query
    // over it produced dozens of unusable combinations. The join table holds
    // the 21 real deities, and a bhajan with several appears under each.
    prisma.deity.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.bhajan.findMany({
      distinct: ["language"],
      select: { language: true },
      orderBy: { language: "asc" },
    }),
    /*
     * Ordered by how much each tag is used, not alphabetically, and the count is
     * shown. The masterlist's tags were split on whitespace at seed time, so
     * "ribbons of love" became three tags and the tail of this list is wreckage
     * — `of`, `one`, `my`. Putting the useful ones first makes the list usable
     * without inventing a rule about which of the group's own words to hide.
     */
    prisma.tag.findMany({
      select: { name: true, _count: { select: { bhajans: true } } },
      orderBy: [{ bhajans: { _count: "desc" } }, { name: "asc" }],
    }),
  ]);

  const deityOptions = deities.map((d) => d.name);
  // Split the combined values into the distinct languages actually present,
  // so the dropdown lists languages rather than combinations of them.
  const langOptions = [
    ...new Set(
      langs
        .map((l) => l.language)
        .filter((v): v is string => typeof v === "string")
        .flatMap((v) => v.split(",").map((x) => x.trim()))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="grid gap-4">
      {/* Come back to a bhajan list 3,600 rows deep and land where you left it.
          Suspense because it reads the query string. */}
      <Suspense fallback={null}>
        <KeepScroll prefix="bhajans" />
      </Suspense>
      <Card>
        <CardHeader>
          <div className="mb-2 flex justify-end">
            <Link href="/bhajans/new">
              <Button type="button" className="h-9 text-xs">Add a bhajan</Button>
            </Link>
          </div>
          <CardTitle>Bhajans</CardTitle>
          <div className="mt-2 text-sm text-on-surface-muted">
            Search by title / lyrics / meaning / raga / composer / tag. Filter by deity, language or tag.
          </div>
        </CardHeader>

        <CardContent>
          {/*
            method="get" and a real submit button. Without them nothing ever
            navigated: a form with more than one field does not implicitly
            submit on Enter, and the selects had no handler, so typing "shiva"
            and pressing Enter did nothing at all.
          */}
          <form method="get" action="/bhajans" className="mb-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
            <Input name="q" defaultValue={q} placeholder="Search…" />

            <select
              name="deity"
              defaultValue={deity}
              className="w-full rounded-[12px] border px-3 py-2 text-sm bg-panel"
            >
              <option value="">All deities</option>
              {deityOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              name="lang"
              defaultValue={lang}
              className="w-full rounded-[12px] border px-3 py-2 text-sm bg-panel"
            >
              <option value="">All languages</option>
              {langOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              name="tag"
              defaultValue={tag}
              className="w-full rounded-[12px] border px-3 py-2 text-sm bg-panel"
            >
              <option value="">All tags</option>
              {tags.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name} ({x._count.bhajans})
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <Button type="submit" variant="primary">Search</Button>
              {q || deity || lang || tag ? (
                <Link href="/bhajans">
                  <Button type="button">Clear</Button>
                </Link>
              ) : null}
            </div>
          </form>

          <div className="mb-2 text-sm text-on-surface-muted">
            Showing {items.length} result{items.length === 1 ? "" : "s"}
            {items.length === 500 ? " (capped at 500 — narrow the search)" : ""}
            {q || deity || lang || tag ? " for the current filters" : ""}
          </div>

          <div className="grid gap-2">
            {items.map((b) => (
              <Link
                key={b.id}
                href={`/bhajans/${b.id}`}
                className="rounded-[12px] border border-rule-surface bg-panel p-3 hover:bg-panel-hover"
              >
                <div className="flex items-center gap-2">
                  <DeitySymbols deities={b.deities.map((d) => d.deity.name)} size={16} />
                  <span className="text-sm font-semibold">
                    <Marked text={b.title} query={q} />
                  </span>
                </div>
                <div className="mt-1 text-xs text-on-surface-muted">
                  {b.deity ? <>Deity: {b.deity}</> : null}
                  {b.deity && (b.language || b.raga) ? " · " : null}
                  {b.language ? <>Lang: {b.language}</> : null}
                  {b.language && b.raga ? " · " : null}
                  {/* Marked because raga is one of the fields the box searches,
                      and a row returned for its raga should say so where the
                      raga already is rather than in a second line. */}
                  {b.raga ? (
                    <>
                      Raga: <Marked text={b.raga} query={q} />
                    </>
                  ) : null}
                </div>

                {/*
                  Why this row is here, when the reason is not the title.
                  Sailavan, 2026-08-21: "if something matches in the bhajan
                  search it should give a preview of where it matched, like we
                  had when searching in sessions".

                  Same shape as the session card's `notes:` line. The title and
                  raga above are marked in place, so this only speaks when the
                  hit was somewhere invisible — a word deep in a lyric, a
                  composer, a tag.
                */}
                {(() => {
                  const hit = firstMatch(
                    [
                      { label: "lyrics", text: b.lyrics },
                      { label: "meaning", text: b.meaning },
                      { label: "composer", text: b.composer },
                      {
                        label: "tag",
                        // Only the tags that actually matched. Joining all of
                        // them would print "sheet-music, karaoke" to explain a
                        // search for "karaoke", which explains it worse.
                        text: b.tags
                          .map((x) => x.tag.name)
                          .filter((name) => matches(name, q))
                          .join(", "),
                      },
                    ],
                    // Nothing to explain when the title already carries the hit.
                    matches(b.title, q) ? "" : q,
                  );
                  if (!hit) return null;
                  return (
                    <p className="mt-1 text-[11px] italic text-on-surface-muted">
                      {hit.label}: <Marked text={hit.text} query={q} />
                    </p>
                  );
                })()}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
