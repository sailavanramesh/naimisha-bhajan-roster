import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default async function FestivalPage() {
  const singers = await prisma.singer.findMany({
    orderBy: { name: "asc" },
    include: { festivalBhajans: { orderBy: { order: "asc" } } },
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Festival Bhajans</CardTitle>
          <div className="mt-2 text-sm text-gray-600">Per-singer festival list.</div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {singers.map((s) => (
              <div key={s.id} className="rounded-2xl border bg-white p-4">
                <div className="text-sm font-semibold">{s.name}</div>
                <ol className="mt-2 list-decimal pl-5 text-sm text-gray-700">
                  {s.festivalBhajans.length === 0 ? (
                    <li className="list-none text-gray-600">No festival bhajans.</li>
                  ) : (
                    s.festivalBhajans.map((b) => <li key={b.id}>{b.title}</li>)
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
