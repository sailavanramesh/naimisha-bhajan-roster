import { NextResponse } from "next/server";
import { Gender } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { suggestPitch } from "@/lib/suggestedPitch";
import { predictForSinger } from "@/lib/singerProfile";
import { getPitchLabels, getSingerProfile } from "@/lib/pitchQueries";
import { historyCutoff } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What should this singer sing this bhajan at, and do they already know it?
 *
 * Both questions are about the same (singer, bhajan) pair, so they share a
 * round trip. The suggestion machinery already existed in lib/suggestedPitch —
 * their own list, then what they have actually sung, then their median offset
 * applied to the reference, then the bare reference, with the LOWER winning
 * when the first two disagree — but only the assign panel could see it.
 * Sailavan: "how do we bring in the predicted pitch of a bhajan for a singer
 * as a suggestion when they want to mark it, learn it or even enter it into
 * the roster."
 *
 * A suggestion, never a write. `confirmedPitch` is the historical record.
 */
export async function GET(req: Request) {
  const role = await getRole();
  if (!can(role, "exploreBhajans")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const singerId = (searchParams.get("singerId") ?? "").trim();
  const bhajanId = (searchParams.get("bhajanId") ?? "").trim();
  if (!singerId || !bhajanId) {
    return NextResponse.json({ error: "singerId and bhajanId are required" }, { status: 400 });
  }

  const [singer, bhajan] = await Promise.all([
    prisma.singer.findUnique({ where: { id: singerId }, select: { id: true, name: true, gender: true } }),
    prisma.bhajan.findUnique({
      where: { id: bhajanId },
      select: { id: true, title: true, raga: true, referenceGentsPitch: true, referenceLadiesPitch: true },
    }),
  ]);
  if (!singer || !bhajan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [listRow, sung, labels, profileRow] = await Promise.all([
    prisma.singerRepertoire.findFirst({
      where: { singerId, bhajanId },
      select: { kind: true, preferredPitch: true, isFestival: true },
    }),
    // Only what has actually been sung: a pitch typed while planning a future
    // session is not evidence of anything (lib/dates.ts, historyCutoff).
    prisma.sessionSlot.findMany({
      where: { singerId, bhajanId, session: { date: { lte: historyCutoff() } } },
      orderBy: { session: { date: "desc" } },
      select: { confirmedPitch: true, session: { select: { date: true } } },
    }),
    getPitchLabels(),
    getSingerProfile(singerId, singer.name),
  ]);

  const reference =
    singer.gender === Gender.Ladies ? bhajan.referenceLadiesPitch : bhajan.referenceGentsPitch;

  const predicted = predictForSinger(
    profileRow.profile,
    reference,
    bhajan.raga,
    labels.map((l) => l.label),
  );

  const suggestion = suggestPitch({
    listPitch: listRow?.preferredPitch ?? null,
    sungPitches: sung.map((s) => s.confirmedPitch),
    predicted: predicted.predicted ? predicted.label : null,
    reference,
  });

  const sungCount = sung.filter((s) => s.confirmedPitch).length;

  return NextResponse.json({
    singer: { id: singer.id, name: singer.name },
    bhajan: { id: bhajan.id, title: bhajan.title },
    /** Null when it is not on their list at all. */
    onList: listRow
      ? { kind: listRow.kind, preferredPitch: listRow.preferredPitch, isFestival: listRow.isFestival }
      : null,
    sung: {
      times: sungCount,
      lastOn: sung.find((s) => s.confirmedPitch)?.session.date.toISOString().slice(0, 10) ?? null,
    },
    suggestion,
    reference: reference ?? null,
  });
}
