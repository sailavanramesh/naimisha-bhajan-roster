import Link from "next/link";
import { prisma } from "@/lib/db";
import { Gender } from "@prisma/client";
import { Button } from "@/components/ui";
import { computeRecommendedPitch } from "@/lib/computeRecommendedPitch";
import { tablaPitchOf, semitoneDelta } from "@/lib/pitch";

export const dynamic = "force-dynamic";

/**
 * The roster sheet, for a music stand (docs/SPEC.md §4.H).
 *
 * One page, legible at arm's length. No navigation, no colour dependence —
 * this gets printed in black and white and read from a metre away, so the
 * pitch is set in large mono type and the deviation is spelled out in words
 * rather than carried by kumkum alone.
 */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      slots: {
        orderBy: { position: "asc" },
        include: { singer: true, bhajan: true },
      },
      instruments: { orderBy: { instrument: "asc" } },
    },
  });

  if (!session) return <div>Not found</div>;

  const dateLabel = session.date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="print-sheet grid gap-4 rounded-[14px] bg-[#FBF8F3] p-6 text-[#14121A] print:rounded-none print:bg-white print:p-0">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/roster/${id}`}>
          <Button>Back to the session</Button>
        </Link>
        <span className="text-sm text-on-surface-muted">
          Use your browser&rsquo;s Print. This page is public — the link can be shared with
          anyone, and shows no edit controls.
        </span>
      </div>

      <header className="border-b-2 border-black/70 pb-2">
        <h1 className="font-display text-3xl font-semibold">Naimiṣa Bhajan Roster</h1>
        <p className="mt-1 text-lg">{dateLabel}</p>
      </header>

      <ol className="grid gap-3">
        {session.slots.map((slot) => {
          const reference =
            computeRecommendedPitch(slot.singer?.gender ?? null, slot.bhajan) ||
            slot.historicalRecommendedPitch ||
            null;
          const pitch = slot.confirmedPitch || reference;
          const delta = semitoneDelta(slot.confirmedPitch, reference);
          const tabla = tablaPitchOf(pitch);

          return (
            <li key={slot.id} className="print-slot border-b border-black/25 pb-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono tabular text-xl font-semibold">
                  {String(slot.position).padStart(2, "0")}
                </span>
                <span className="font-display text-2xl font-semibold leading-tight">
                  {slot.bhajan?.title ?? slot.bhajanTitle ?? slot.festivalBhajanTitle ?? "—"}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-lg">
                <span>
                  <span className="text-on-surface-muted">Singer </span>
                  <strong>{slot.singer?.name ?? "—"}</strong>
                  {slot.singer?.gender ? (
                    <span className="text-on-surface-muted">
                      {" "}
                      ({slot.singer.gender === Gender.Ladies ? "Ladies" : "Gents"})
                    </span>
                  ) : null}
                </span>

                <span>
                  <span className="text-on-surface-muted">Pitch </span>
                  <span className="font-mono tabular text-xl font-semibold">{pitch ?? "—"}</span>
                </span>

                <span>
                  <span className="text-on-surface-muted">Tabla </span>
                  <span className="font-mono tabular text-xl font-semibold">{tabla ?? "—"}</span>
                </span>
              </div>

              {delta !== null && delta !== 0 ? (
                <div className="mt-1 text-base">
                  {/* Spelled out, not colour-coded: this is printed in mono. */}
                  {Math.abs(delta)} semitone{Math.abs(delta) === 1 ? "" : "s"}{" "}
                  {delta > 0 ? "above" : "below"} the {slot.singer?.gender ?? "gender"} reference
                  {reference ? ` (${reference})` : ""}
                </div>
              ) : null}

              <div className="mt-1 text-base text-on-surface-muted">
                {[slot.bhajan?.raga, slot.bhajan?.beat].filter(Boolean).join(" · ") || " "}
              </div>
            </li>
          );
        })}
      </ol>

      {session.instruments.length > 0 ? (
        <section className="print-slot">
          <h2 className="font-display text-xl font-semibold">Instruments</h2>
          <ul className="mt-1 grid gap-0.5 text-lg sm:grid-cols-2">
            {session.instruments.map((i) => (
              <li key={i.id}>
                <span className="text-on-surface-muted">{i.instrument}: </span>
                <strong>{i.person ?? "—"}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {session.notes ? (
        <section className="print-slot">
          <h2 className="font-display text-xl font-semibold">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-base">{session.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
