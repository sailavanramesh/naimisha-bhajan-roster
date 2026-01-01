import Link from "next/link";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import { SessionSingersGrid } from "./SessionSingersGrid";
import { updateSessionNotes, addInstrumentRow, deleteInstrumentRow } from "./actions";

export default async function SessionPage({ params }: { params: { id: string } }) {
  const session = await prisma.session.findUnique({
    where: { id: params.id },
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

  const suggestions = canEdit
    ? await (async () => {
        const pitchRows = await prisma.pitchLookup.findMany({
          select: { label: true, tablaPitch: true },
          orderBy: { label: "asc" },
        });

        const pitches = pitchRows.map((x) => x.label).filter(Boolean) as string[];
        const pitchToTabla: Record<string, string> = {};
        for (const row of pitchRows) {
          if (!row.label) continue;
          pitchToTabla[row.label] = row.tablaPitch ?? "";
        }

        const instrumentRowsRaw = await prisma.instrumentPerson.findMany({
          select: { instrument: true },
          orderBy: { instrument: "asc" },
        });

        const peopleRowsRaw = await prisma.instrumentPerson.findMany({
          select: { person: true },
          orderBy: { person: "asc" },
        });

        const instruments = Array.from(
          new Set(
            instrumentRowsRaw
              .map((x) => x.instrument)
              .filter((v): v is string => !!v && v.trim().length > 0)
              .map((v) => v.trim())
          )
        ).sort((a, b) => a.localeCompare(b));

        const people = Array.from(
          new Set(
            peopleRowsRaw
              .map((x) => x.person)
              .filter((v): v is string => !!v && v.trim().length > 0)
              .map((v) => v.trim())
          )
        ).sort((a, b) => a.localeCompare(b));

        return { pitches, pitchToTabla, instruments, people };
      })()
    : { pitches: [], pitchToTabla: {}, instruments: [], people: [] };

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

  const instrumentListId = `instrument-options-${session.id}`;
  const peopleListId = `people-options-${session.id}`;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{dateLabel}</CardTitle>
              <div className="mt-1 text-sm text-slate-600">
                Session details and roster entries for this day.
              </div>
            </div>

            <div
              className={[
                "rounded-2xl border px-3 py-2 text-xs font-medium",
                canEdit ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
              ].join(" ")}
            >
              {canEdit ? "Edit mode ON" : "Read-only"}
            </div>
          </div>

          <div className="mt-4">
            <Link href="/roster" className="text-sm underline underline-offset-2 text-slate-700">
              Back to roster
            </Link>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6">
          {/* Notes */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="text-sm font-semibold mb-2">Notes</div>
            {canEdit ? (
              <form action={onUpdateNotes} className="grid gap-2">
                <textarea
                  name="notes"
                  defaultValue={session.notes ?? ""}
                  className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                  placeholder="Session notes…"
                />
                <div>
                  <Button type="submit" className="bg-slate-900 text-white border-slate-900 hover:bg-slate-900/90">
                    Save notes
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm whitespace-pre-wrap">
                {session.notes ?? "—"}
              </div>
            )}
          </div>

          {/* Grid editor */}
          <SessionSingersGrid
            canEdit={canEdit}
            sessionId={session.id}
            singers={allSingers}
            initialRows={initialRows}
            suggestions={{
              pitches: suggestions.pitches,
              pitchToTabla: suggestions.pitchToTabla,
            }}
          />

          {/* Instruments */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="text-sm font-semibold mb-3">Instruments</div>

            <datalist id={instrumentListId}>
              {suggestions.instruments.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>

            <datalist id={peopleListId}>
              {suggestions.people.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>

            {canEdit ? (
              <form action={onAddInstrument} className="mb-4 grid gap-2">
                <div className="text-sm font-medium text-slate-800">Add instrument</div>
                <Input name="instrument" placeholder="Instrument (e.g., Tabla)" list={instrumentListId} />
                <Input name="person" placeholder="Person (optional)" list={peopleListId} />
                <div>
                  <Button type="submit" className="bg-slate-900 text-white border-slate-900 hover:bg-slate-900/90">
                    Add
                  </Button>
                </div>
              </form>
            ) : null}

            <div className="grid gap-2">
              {session.instruments.length === 0 ? (
                <div className="text-sm text-slate-600">No instrument assignments.</div>
              ) : (
                session.instruments.map((i) => (
                  <div key={i.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{i.instrument}</div>
                        <div className="text-slate-700">{i.person ?? "—"}</div>
                      </div>

                      {canEdit ? (
                        <form
                          action={async () => {
                            "use server";
                            await deleteInstrumentRow(i.id);
                          }}
                        >
                          <Button className="border-red-200 text-red-700 hover:bg-red-50">
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
        </CardContent>
      </Card>
    </div>
  );
}
