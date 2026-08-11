import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function SingersPage() {
  /*
   * Singers only. Somebody with no recorded voice is a user, not a singer —
   * a mic operator, or an instrumentalist who does not sing — and listing them
   * here made a page called Singers answer a different question. They are
   * managed in Admin, which is where people live.
   */
  const singers = await prisma.singer.findMany({
    where: { gender: { not: null } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Singers</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {singers.map((s) => (
              <Link key={s.id} href={`/singers/${s.id}`} className="rounded-[12px] border border-rule-surface bg-panel p-3 hover:bg-panel-hover">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-on-surface-muted">{s.gender}</div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
