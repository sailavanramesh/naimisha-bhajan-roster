import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default async function SingerPage({ params }: { params: { id: string } }) {
  const singer = await prisma.singer.findUnique({ where: { id: params.id } });
  if (!singer) return <div>Not found</div>;

  const history = await prisma.sessionSinger.findMany({
    where: { singerId: singer.id },
    orderBy: { session: { date: "desc" } },
    take: 50,
    include: { session: true, bhajan: true },
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{singer.name}</CardTitle>
          <div className="mt-2 text-sm text-gray-600">Recent history (latest 50).</div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {history.map((h) => (
              <Link key={h.id} href={`/roster/${h.sessionId}`} className="rounded-xl border bg-white p-3 hover:bg-gray-50">
                <div className="text-sm font-medium">
                  {new Date(h.session.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </div>
                <div className="mt-1 text-sm text-gray-700">{h.bhajanTitle ?? h.festivalBhajanTitle ?? "—"}</div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
