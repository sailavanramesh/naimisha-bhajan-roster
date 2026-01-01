import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default async function SingersPage() {
  const singers = await prisma.singer.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Singers</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {singers.map((s) => (
              <Link key={s.id} href={`/singers/${s.id}`} className="rounded-xl border bg-white p-3 hover:bg-gray-50">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-gray-600">{s.gender ?? "—"}</div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
