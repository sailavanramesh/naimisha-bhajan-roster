import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { NOT_ARCHIVED } from "@/lib/archive";

export const dynamic = "force-dynamic";
export default async function InstrumentsPage() {
  const role = await getRole();
  if (!can(role, "viewAllPages")) return <NoAccess what="The instruments page" role={role} />;

  const sessions = await prisma.session.findMany({
    where: { ...NOT_ARCHIVED },
    orderBy: { date: "desc" },
    take: 120,
    include: { instruments: true },
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Instrumentalist Roster</CardTitle>
          <div className="mt-2 text-sm text-on-surface-muted">Latest 120 sessions.</div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-[12px] border border-rule-surface bg-panel p-3">
                <div className="text-sm font-medium">
                  {/* UTC: a session date is a calendar date, not an instant. */}
                  {new Date(s.date).toLocaleDateString("en-AU", {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </div>
                <div className="mt-2 grid gap-1 md:grid-cols-2">
                  {s.instruments.length === 0 ? (
                    <div className="text-sm text-on-surface-muted">No instrument assignments.</div>
                  ) : (
                    s.instruments
                      .sort((a,b) => a.instrument.localeCompare(b.instrument))
                      .map((i) => (
                        <div key={i.id} className="text-sm">
                          <span className="font-medium">{i.instrument}:</span>{" "}
                          <span className="text-on-surface-muted">{i.person ?? "—"}</span>
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

