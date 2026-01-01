import Link from "next/link";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import { SessionSingersGrid } from "./SessionSingersGrid";
import { updateSessionNotes, addInstrumentRow, deleteInstrumentRow } from "./actions";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      singers: {
        include: { singer: true, bhajan: true },
        orderBy: { createdAt: "asc" },
      },
      instruments: { orderBy: { instrument: "asc" } },
    },
  });

  if (!session) return <div>Not found</div>;

  const canEdit = cookies().get("edit")?.value === "1";

  const allSingers = canEdit ? await prisma.singer.findMany({ orderBy: { name: "asc" } }) : [];

  const initialRows = session.singers.map((x) => ({
    id: x.id,
    singerId: x.singerId,
    singerName: x.singer.name,
    singerGender: x.singer.gender,
    bhajanId: x.bhajanId,
    bhajanTitle: x.bhajanTitle,
    festivalBhajanTitle: x.festivalBhajanTitle,
    confirmedPitch: x.confirmedPitch,
    alternativeTablaPitch: x.alternativeTablaPitch,
    recommendedPitch: x.recommendedPitch,
    raga: x.raga,
  }));

  const dateLabel = new Date(session.date).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Suggestions (server-side, fast)
  const [pitchOptions, tablaMapRows] = await Promise.all([
    prisma.pitchLookup.findMany({
      select: { label: true },
      orderBy: { label: "asc" },
    }),
    prisma.pitchLookup.findMany({
      select: { label: true, tablaPitch: true },
      orderBy: { label: "asc" },
    }),
  ]);

  const pitchToTabla: Record<string, string> = {};
  for (const r of tablaMapRows) {
    if (r.label && r.tablaPitch) pitchToTabla[r.label] = r.tablaPitch;
  }

  const suggestions = {
    pitches: pitchOptions.map((x) => x.label).filter(Boolean) as string[],
    pitchToTabla,
  };

  async function onUpdateNotes(formData: FormData) {
    "use server";
    await updateSessionNotes(session.id, String(formData.get("notes") || ""));
  }

  async function onAddInstrument(formData: FormData) {
    "use server";
    await addInstrumentRow(
      session.id,
      String(formData.get("instrument") || ""),
      String(formData.get("person") || "")
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{dateLabel}</CardTitle>

          {canEdit ? (
            <div className="mt-2 rounded-xl border bg-green-50 p-3 text-sm">
              <div className="font-medium">Edit mode is ON for this browser.</div>
              <div className="text-gray-700">
                Anyone with your edit link key can enable edit mode. Keep the key private if you want to avoid random edits.
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-xl border bg-amber-50 p-3 text-sm">
              <div className="font-medium">Read-only mode</div>
              <div className="text-gray-700">
                To edit, open the special edit link that includes the key (for example:{" "}
                <span className="font-mono">?k=…</span>).
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="grid gap-6">
          {/* Notes */}
          <div>
            <div className="text-sm font-semibold mb-2">Notes</div>
            {canEdit ? (
              <form action={onUpdateNotes} className="grid gap-2">
                <textarea
                  name="notes"
                  defaultValue={session.notes ?? ""}
                  className="min-h-[80px] w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  placeholder="Session notes…"
                />
                <div>
                  <Button type="submit">Save notes</Button>
                </div>
              </form>
            ) : (
              <div className="rounded-xl border bg-white p-3 text-sm whitespace-pre-wrap">
                {session.notes ?? "—"}
              </div>
            )}
          </div>

          {/* Grid editor for bhajans/singers */}
          <SessionSingersGrid
            canEdit={canEdit}
            sessionId={session.id}
            singers={allSingers}
            initialRows={initialRows}
            suggestions={suggestions}
          />

          {/* Instruments */}
          <div>
            <div className="text-sm font-semibold mb-2">Instruments</div>

            {canEdit ? (
              <form action={onAddInstrument} className="mb-3 rounded-2xl border bg-white p-3 grid gap-2">
                <div className="text-sm font-medium">Add instrument</div>
                <Input name="instrument" placeholder="Instrument (e.g., Tabla)" />
                <Input name="person" placeholder="Person (optional)" />
                <div>
                  <Button type="submit">Add</Button>
                </div>
              </form>
            ) : null}

            <div className="grid gap-2">
              {session.instruments.length === 0 ? (
                <div className="text-sm text-gray-600">No instrument assignments.</div>
              ) : (
                session.instruments.map((i) => (
                  <div key={i.id} className="rounded-xl border bg-white p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{i.instrument}</div>
                        <div className="text-gray-700">{i.person ?? "—"}</div>
                      </div>

                      {canEdit ? (
                        <form
                          action={async () => {
                            "use server";
                            await deleteInstrumentRow(i.id);
                          }}
                        >
                          <Button type="submit" className="border-red-300 text-red-700 hover:bg-red-50">
                            Delete
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="text-sm">
            <Link href="/roster" className="underline underline-offset-2">
              Back to roster
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
