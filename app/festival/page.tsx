import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function FestivalPage() {
  const singers = await prisma.singer.findMany({
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
              <div key={s.id} className="rounded-key border border-rule-surface bg-white/60 p-4">
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
