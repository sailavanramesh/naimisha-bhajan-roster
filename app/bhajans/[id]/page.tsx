import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default async function BhajanPage({ params }: { params: { id: string } }) {
  const b = await prisma.bhajan.findUnique({ where: { id: params.id } });
  if (!b) return <div>Not found</div>;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{b.title}</CardTitle>
          <div className="mt-2 text-sm text-gray-600">
            {b.deity ? `Deity: ${b.deity}` : "Deity: —"} · {b.language ? `Language: ${b.language}` : "Language: —"} · {b.raga ? `Raga: ${b.raga}` : "Raga: —"}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {b.url ? <div className="text-sm"><a className="underline" href={b.url} target="_blank">Source</a></div> : null}

          {b.meaning ? (
            <div>
              <div className="text-sm font-semibold mb-1">Meaning</div>
              <pre className="whitespace-pre-wrap rounded-xl border bg-white p-3 text-sm">{b.meaning}</pre>
            </div>
          ) : null}

          {b.lyrics ? (
            <div>
              <div className="text-sm font-semibold mb-1">Lyrics</div>
              <pre className="whitespace-pre-wrap rounded-xl border bg-white p-3 text-sm">{b.lyrics}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
