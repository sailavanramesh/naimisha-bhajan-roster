import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default async function InstrumentsPage() {
  const sessions = await prisma.session.findMany({
    orderBy: { date: "desc" },
    take: 120,
    include: { instruments: true },
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Instrumentalist Roster</CardTitle>
          <div className="mt-2 text-sm text-gray-600">Latest 120 sessions.</div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-xl border bg-white p-3">
                <div className="text-sm font-medium">
                  {new Date(s.date).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                </div>
                <div className="mt-2 grid gap-1 md:grid-cols-2">
                  {s.instruments.length === 0 ? (
                    <div className="text-sm text-gray-600">No instrument assignments.</div>
                  ) : (
                    s.instruments
                      .sort((a,b) => a.instrument.localeCompare(b.instrument))
                      .map((i) => (
                        <div key={i.id} className="text-sm">
                          <span className="font-medium">{i.instrument}:</span>{" "}
                          <span className="text-gray-700">{i.person ?? "—"}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
