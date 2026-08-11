import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";

export const dynamic = "force-dynamic";
export default async function FestivalPage() {
  const role = await getRole();
  if (!can(role, "viewAllPages")) return <NoAccess what="The festival page" role={role} />;

  // Who could sing at a festival, so rosterable singers only.
  const singers = await prisma.singer.findMany({
    where: { gender: { not: null } },
    orderBy: { name: "asc" },
    include: {
      repertoire: {
        where: { kind: RepertoireKind.festival },
        orderBy: { order: "asc" },
      },
    },
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Festival Bhajans</CardTitle>
          <div className="mt-2 text-sm text-on-surface-muted">Per-singer festival list.</div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {singers.map((s) => (
              <div key={s.id} className="rounded-[12px] border border-rule-surface bg-panel p-4">
                <div className="text-sm font-semibold">{s.name}</div>
                <ol className="mt-2 list-decimal pl-5 text-sm text-on-surface-muted">
                  {s.repertoire.length === 0 ? (
                    <li className="list-none text-on-surface-muted">No festival bhajans.</li>
                  ) : (
                    s.repertoire.map((b) => <li key={b.id}>{b.title}</li>)
                  )}
                </ol>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

