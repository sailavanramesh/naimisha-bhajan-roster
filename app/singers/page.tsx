import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function SingersPage() {
  const singers = await prisma.singer.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Singers</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {singers.map((s) => (
              <Link key={s.id} href={`/singers/${s.id}`} className="rounded-[12px] border border-rule-surface bg-panel p-3 hover:bg-panel-hover">
                <div className="text-sm font-medium">{s.name}</div>
                {/* Kept in the list — they are a real person with access — but
                    said plainly, because this page is called Singers and they
                    cannot be rostered as one. */}
                <div className="text-xs text-on-surface-muted">
                  {s.gender ?? "no voice recorded · not rostered as a singer"}
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
