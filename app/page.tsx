import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default async function Page() {
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const upcoming = await prisma.session.findMany({
    where: { date: { gte: today, lte: in30 } },
    orderBy: { date: "asc" },
    take: 12,
    include: { singers: { include: { singer: true } } },
  });

  const masterCount = await prisma.bhajan.count();
  const sessionCount = await prisma.session.count();
  const singerCount = await prisma.singer.count();

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Bhajans</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{masterCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{sessionCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Singers</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{singerCount}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Upcoming (next 30 days)</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="text-sm text-gray-600">No upcoming sessions found. Seed/import your XLSX first.</div>
          ) : (
            <div className="grid gap-2">
              {upcoming.map((s) => (
                <Link key={s.id} href={`/roster/${s.id}`} className="rounded-xl border bg-white p-3 hover:bg-gray-50">
                  <div className="text-sm font-medium">
                    {new Date(s.date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    {s.singers
                      .slice(0, 6)
                      .map((x) => x.singer.name)
                      .join(" · ")}
                    {s.singers.length > 6 ? " …" : ""}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
