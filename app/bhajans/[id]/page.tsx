import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";

export default async function BhajanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const bhajan = await prisma.bhajan.findUnique({
    where: { id },
  });

  if (!bhajan) {
    return (
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Bhajan not found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600 mb-3">
              This bhajan may have been deleted or the link is incorrect.
            </div>
            <Link href="/bhajans">
              <Button>Back to Bhajans</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{bhajan.title}</CardTitle>
              <div className="mt-2 text-sm text-gray-600">
                {bhajan.raga ? `Raga: ${bhajan.raga}` : "Raga: —"}
              </div>
            </div>

            <Link href="/bhajans">
              <Button>Back</Button>
            </Link>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs font-semibold text-gray-700">Gents pitch</div>
              <div className="mt-1 text-sm">{bhajan.referenceGentsPitch ?? "—"}</div>
            </div>

            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs font-semibold text-gray-700">Ladies pitch</div>
              <div className="mt-1 text-sm">{bhajan.referenceLadiesPitch ?? "—"}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Lyrics</div>
              <div className="text-sm whitespace-pre-wrap">{bhajan.lyrics ?? "—"}</div>
            </div>

            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Meaning</div>
              <div className="text-sm whitespace-pre-wrap">{bhajan.meaning ?? "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
