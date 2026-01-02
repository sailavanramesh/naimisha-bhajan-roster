import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import { SessionSingersGrid } from "./SessionSingersGrid";
import { getPitchSuggestions } from "@/lib/pitchSuggestions";
import { deleteInstrumentRow, updateSessionNotes } from "./actions";

export default async function RosterSessionPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;

  const c = await cookies();
  const canEdit = c.get("edit")?.value === "1";

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      singers: { include: { singer: true, bhajan: true }, orderBy: { sortOrder: "asc" } },
      instruments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) return <div>Not found</div>;

  const allSingers = canEdit ? await prisma.singer.findMany({ orderBy: { name: "asc" } }) : [];

  const initialRows = session.singers.map((r) => ({
    id: r.id,
    singerId: r.singerId,
    singerName: r.singer?.name ?? "",
    bhajanId: r.bhajanId,
    bhajanTitle: r.bhajanTitle ?? r.bhajan?.title ?? "",
    confirmedPitch: r.confirmedPitch ?? "",
    recommendedPitch: r.recommendedPitch ?? "",
    tabla: r.tabla ?? "",
    notes: r.notes ?? "",
  }));

  const suggestions = await getPitchSuggestions();

  async function onUpdateNotes(formData: FormData) {
    "use server";
    await updateSessionNotes(session.id, String(formData.get("notes") || ""));
  }

  async function onAddInstrument(formData: FormData) {
    "use server";
    const instrument = String(formData.get("instrument") || "").trim();
    const person = String(formData.get("person") || "").trim();
    if (!instrument) return;

    await prisma.sessionInstrument.create({
      data: { sessionId: session.id, instrument, person: person || null },
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {new Date(session.date).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </CardTitle>

          <div className="mt-2 flex items-center gap-2 text-sm">
            {canEdit ? (
              <span className="rounded-xl border bg-green-50 px-3 py-1">Edit mode ON</span>
            ) : (
              <span className="rounded-xl border bg-amber-50 px-3 py-1">Read-only</span>
            )}

            <Link href="/roster" className="underline underline-offset-2">
              Back
            </Link>
          </div>
        </CardHeader>

        {/* ✅ Notes at the bottom (as requested) */}
        <CardContent className="grid gap-6">
          {/* Main roster */}
          <SessionSingersGrid
            canEdit={canEdit}
            sessionId={sessionId}
            singers={allSingers}
            initialRows={initialRows}
            suggestions={suggestions}
          />

          {/* Collapsible: Instruments */}
          <details className="rounded-2xl border bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Instruments</span>
              <span className="text-xs font-normal text-gray-600">
                {session.instruments.length
                  ? `${session.instruments.length} item${session.instruments.length === 1 ? "" : "s"}`
                  : "None"}
              </span>
            </summary>

            <div className="px-4 pb-4 pt-0 grid gap-3">
              {canEdit ? (
                <form action={onAddInstrument} className="rounded-2xl border bg-slate-50 p-3 grid gap-2">
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
          </details>

          {/* Collapsible: Notes */}
          <details className="rounded-2xl border bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Notes</span>
              <span className="text-xs font-normal text-gray-600">
                {(session.notes?.trim()?.length ?? 0) > 0 ? "Has notes" : "Empty"}
              </span>
            </summary>

            <div className="px-4 pb-4 pt-0 grid gap-2">
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
          </details>

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
