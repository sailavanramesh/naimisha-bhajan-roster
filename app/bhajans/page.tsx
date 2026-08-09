import Link from "next/link";
import { Button } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function BhajansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deity?: string; lang?: string }>;
}) {
  const sp = await searchParams;

  const q = (sp?.q ?? "").trim();
  const deity = (sp?.deity ?? "").trim();
  const lang = (sp?.lang ?? "").trim();

  // Build filter
  const where: Prisma.BhajanWhereInput = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { lyrics: { contains: q, mode: "insensitive" } },
      { meaning: { contains: q, mode: "insensitive" } },
      { raga: { contains: q, mode: "insensitive" } },
    ];
  }
  if (deity) where.deities = { some: { deity: { name: deity } } };
  if (lang) where.language = lang;

  const [items, deities, langs] = await Promise.all([
    prisma.bhajan.findMany({
      where,
      orderBy: { title: "asc" },
      take: 500,
      include: { deities: { include: { deity: true } } },
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
  ]);

  const deityOptions = deities.map((d) => d.name);
  const langOptions = langs.map((l) => l.language).filter(Boolean) as string[];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="mb-2 flex justify-end">
            <Link href="/bhajans/new">
              <Button type="button" className="h-9 text-xs">Add a bhajan</Button>
            </Link>
          </div>
          <CardTitle>Bhajans</CardTitle>
          <div className="mt-2 text-sm text-on-surface-muted">
            Search by title / lyrics / meaning / raga. Filter by deity or language.
          </div>
        </CardHeader>

        <CardContent>
          {/*
            method="get" and a real submit button. Without them nothing ever
            navigated: a form with more than one field does not implicitly
            submit on Enter, and the selects had no handler, so typing "shiva"
            and pressing Enter did nothing at all.
          */}
          <form method="get" action="/bhajans" className="mb-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
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
            <div className="flex gap-2">
              <Button type="submit" variant="primary">Search</Button>
              {q || deity || lang ? (
                <Link href="/bhajans">
                  <Button type="button">Clear</Button>
                </Link>
              ) : null}
            </div>
          </form>

          <div className="mb-2 text-sm text-on-surface-muted">
            Showing {items.length} result{items.length === 1 ? "" : "s"}
            {items.length === 500 ? " (capped at 500 — narrow the search)" : ""}
            {q || deity || lang ? " for the current filters" : ""}
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
                  <span className="text-sm font-semibold">{b.title}</span>
                </div>
                <div className="mt-1 text-xs text-on-surface-muted">
                  {[
                    b.deity ? `Deity: ${b.deity}` : null,
                    b.language ? `Lang: ${b.language}` : null,
                    b.raga ? `Raga: ${b.raga}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
