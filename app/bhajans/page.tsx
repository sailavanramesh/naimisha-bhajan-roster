import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui";

export default async function BhajansPage({ searchParams }: { searchParams: { q?: string; deity?: string; lang?: string } }) {
  const q = (searchParams?.q ?? "").trim();
  const deity = (searchParams?.deity ?? "").trim();
  const lang = (searchParams?.lang ?? "").trim();

  const [deities, langs] = await Promise.all([
    prisma.bhajan.findMany({ select: { deity: true }, distinct: ["deity"], where: { deity: { not: null } }, orderBy: { deity: "asc" } }),
    prisma.bhajan.findMany({ select: { language: true }, distinct: ["language"], where: { language: { not: null } }, orderBy: { language: "asc" } }),
  ]);

  const bhajans = await prisma.bhajan.findMany({
    where: {
      AND: [
        q ? { OR: [{ title: { contains: q } }, { raga: { contains: q } }, { lyrics: { contains: q } }] } : {},
        deity ? { deity: deity } : {},
        lang ? { language: lang } : {},
      ],
    },
    orderBy: { title: "asc" },
    take: 200,
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Bhajan Masterlist</CardTitle>
          <div className="mt-2 text-sm text-gray-600">Search by title/raga/lyrics. Filter by deity/language.</div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2 md:grid-cols-3 mb-4">
            <Input name="q" defaultValue={q} placeholder="Search…" />
            <Select name="deity" defaultValue={deity}>
              <option value="">All deities</option>
              {deities.map((d) => (d.deity ? <option key={d.deity} value={d.deity}>{d.deity}</option> : null))}
            </Select>
            <Select name="lang" defaultValue={lang}>
              <option value="">All languages</option>
              {langs.map((l) => (l.language ? <option key={l.language} value={l.language}>{l.language}</option> : null))}
            </Select>
          </form>

          <div className="grid gap-2">
            {bhajans.map((b) => (
              <Link key={b.id} href={`/bhajans/${b.id}`} className="rounded-xl border bg-white p-3 hover:bg-gray-50">
                <div className="text-sm font-medium">{b.title}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {b.deity ? `Deity: ${b.deity}` : "Deity: —"} · {b.language ? `Lang: ${b.language}` : "Lang: —"} · {b.raga ? `Raga: ${b.raga}` : "Raga: —"}
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
