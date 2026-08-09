import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/components/ui";
import { SessionSingersGrid } from "./SessionSingersGrid";
import { getPitchSuggestions } from "@/lib/pitchSuggestions";
import { computeRecommendedPitch } from "@/lib/computeRecommendedPitch";
import { deleteInstrumentRow, updateSessionNotes } from "./actions";
import { EnableEditForm } from "@/components/EnableEditForm";

export const dynamic = "force-dynamic";
export default async function RosterSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;

  const cookieStore = await cookies();
  const canEdit = cookieStore.get("edit")?.value === "1";

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      slots: {
        include: { singer: true, bhajan: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      instruments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!session) return <div>Not found</div>;

  const sid = session.id;

  const allSingers = canEdit
    ? await prisma.singer.findMany({ orderBy: { name: "asc" } })
    : [];

  const initialRows = session.slots.map((x) => ({
    id: x.id,
    singerId: x.singerId ?? "",
    singerName: x.singer?.name ?? "Unassigned",
    singerGender: x.singer?.gender ?? null,
    bhajanId: x.bhajanId,
    bhajanTitle: x.bhajanTitle,
    festivalBhajanTitle: x.festivalBhajanTitle,
    confirmedPitch: x.confirmedPitch,
    alternativeTablaPitch: x.alternativeTablaPitch,
    // Derived on read (CLAUDE.md rule 5), not stored. Where the slot's title
    // never resolved to a masterlist bhajan — 11 rows do not — fall back to the
    // recommendation the sheet recorded, so the column is not blank.
    recommendedPitch:
      computeRecommendedPitch(x.singer?.gender ?? null, x.bhajan) || x.historicalRecommendedPitch || null,
    raga: x.bhajan?.raga ?? null,
  }));

  const suggestions = await getPitchSuggestions();

  async function onUpdateNotes(formData: FormData) {
    "use server";
    await updateSessionNotes(sid, String(formData.get("notes") || ""));
  }

  async function onAddInstrument(formData: FormData) {
    "use server";
    const instrument = String(formData.get("instrument") || "").trim();
    const person = String(formData.get("person") || "").trim();
    if (!instrument) return;

    await prisma.sessionInstrument.create({
      data: { sessionId: sid, instrument, person: person || null },
    });
  }

  const sessionDay = new Date(session.date);
  const rosterDay = sessionDay.toISOString().slice(0, 10);
  const rosterMonth = `${sessionDay.getUTCFullYear()}-${String(sessionDay.getUTCMonth() + 1).padStart(2, "0")}`;
  const backToRosterHref = `/roster?view=calendar&m=${rosterMonth}&d=${rosterDay}`;

  const dateLabel = new Date(session.date).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{dateLabel}</CardTitle>

          <div className="mt-2 grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              {canEdit ? (
                <span className="rounded-[12px] border bg-green-50 px-3 py-1">Edit mode ON</span>
              ) : (
                <span className="rounded-[12px] border bg-amber-50 px-3 py-1">Read-only</span>
              )}

              <Link href={backToRosterHref} className="underline underline-offset-2">
                Back to roster
              </Link>

              <Link
                href={`/roster/${sessionId}/assign`}
                className="underline underline-offset-2"
              >
                Assign singers
              </Link>

              <Link
                href={`/roster/${sessionId}/print`}
                className="underline underline-offset-2"
              >
                Print sheet
              </Link>
            </div>

            {!canEdit ? <EnableEditForm returnTo={`/roster/${sessionId}`} compact /> : null}
          </div>
        </CardHeader>

        <CardContent className="grid gap-6">
          {/* Main roster grid */}
          <SessionSingersGrid
            canEdit={canEdit}
            sessionId={sessionId}
            singers={allSingers}
            initialRows={initialRows}
            suggestions={suggestions}
          />

          {/* Collapsible: Instruments */}
          <details className="rounded-[12px] border border-rule-surface bg-white/[0.03]">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Instruments</span>
              <span className="text-xs font-normal text-on-surface-muted">
                {session.instruments.length
                  ? `${session.instruments.length} item${session.instruments.length === 1 ? "" : "s"}`
                  : "None"}
              </span>
            </summary>

            <div className="px-4 pb-4 pt-0 grid gap-3">
              {canEdit ? (
                <form action={onAddInstrument} className="rounded-[12px] border bg-white/[0.05] p-3 grid gap-2">
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
                  <div className="text-sm text-on-surface-muted">No instrument assignments.</div>
                ) : (
                  session.instruments.map((i) => (
                    <div key={i.id} className="rounded-[12px] border border-rule-surface bg-white/[0.03] p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{i.instrument}</div>
                          <div className="text-on-surface-muted">{i.person ?? "—"}</div>
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
          <details className="rounded-[12px] border border-rule-surface bg-white/[0.03]">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold flex items-center justify-between">
              <span>Notes</span>
              <span className="text-xs font-normal text-on-surface-muted">
                {(session.notes?.trim()?.length ?? 0) > 0 ? "Has notes" : "Empty"}
              </span>
            </summary>

            <div className="px-4 pb-4 pt-0 grid gap-2">
              {canEdit ? (
                <form action={onUpdateNotes} className="grid gap-2">
                  <textarea
                    name="notes"
                    defaultValue={session.notes ?? ""}
                    className="min-h-[80px] w-full rounded-[12px] border p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    placeholder="Session notes…"
                  />
                  <div>
                    <Button type="submit">Save notes</Button>
                  </div>
                </form>
              ) : (
                <div className="rounded-[12px] border border-rule-surface bg-white/[0.03] p-3 text-sm whitespace-pre-wrap">
                  {session.notes ?? "—"}
                </div>
              )}
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}