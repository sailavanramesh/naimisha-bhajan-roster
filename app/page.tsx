import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getDashboardData();

  if (!data) {
    return (
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Database setup required</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-gray-700">
            <p>The app could not connect to the database in this environment.</p>
            <p>
              On Vercel, set <code>DATABASE_URL</code> (and redeploy). If you are using Prisma Accelerate or a pooled
              connection, also set <code>DIRECT_URL</code>.
            </p>
            <p>
              After setting env vars, run migrations/seed and redeploy. See project <code>README.md</code> for setup
              steps.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { upcoming, masterCount, sessionCount, singerCount } = data;

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
