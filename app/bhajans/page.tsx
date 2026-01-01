import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";

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
  const where: any = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { lyrics: { contains: q, mode: "insensitive" } },
      { meaning: { contains: q, mode: "insensitive" } },
      { raga: { contains: q, mode: "insensitive" } },
    ];
  }
  if (deity) where.deity = deity;
  if (lang) where.language = lang;

  const [items, deities, langs] = await Promise.all([
    prisma.bhajan.findMany({
      where,
      orderBy: { title: "asc" },
      take: 500,
    }),
    prisma.bhajan.findMany({
      distinct: ["deity"],
      select: { deity: true },
      orderBy: { deity: "asc" },
    }),
    prisma.bhajan.findMany({
      distinct: ["language"],
      select: { language: true },
      orderBy: { language: "asc" },
    }),
  ]);

  const deityOptions = deities.map((d) => d.deity).filter(Boolean) as string[];
  const langOptions = langs.map((l) => l.language).filter(Boolean) as string[];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Bhajans</CardTitle>
          <div className="mt-2 text-sm text-gray-600">
            Search by title / lyrics / meaning / raga. Filter by deity or language.
          </div>
        </CardHeader>

        <CardContent>
          <form className="grid gap-2 md:grid-cols-3 mb-4">
            <Input name="q" defaultValue={q} placeholder="Search…" />

            <select
              name="deity"
              defaultValue={deity}
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
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
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
            >
              <option value="">All languages</option>
              {langOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </form>

          <div className="text-sm text-gray-600 mb-2">
            Showing {items.length} results
          </div>

          <div className="grid gap-2">
            {items.map((b) => (
              <Link
                key={b.id}
                href={`/bhajans/${b.id}`}
                className="rounded-2xl border bg-white p-3 hover:bg-gray-50"
              >
                <div className="text-sm font-semibold">{b.title}</div>
                <div className="mt-1 text-xs text-gray-600">
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
