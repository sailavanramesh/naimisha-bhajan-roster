import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function parseMonth(m: string) {
  const mm = /^(\d{4})-(\d{2})$/.exec(m);
  if (!mm) return null;
  const y = Number(mm[1]);
  const mo = Number(mm[2]) - 1;
  if (mo < 0 || mo > 11) return null;
  return { y, mo };
}

function isoDateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The day's rows, as structure rather than a sentence.
 *
 * This used to return one joined string — "Anvita — Sathya Sai · Ashwin — Mata
 * Maheshwari …" — which the panel printed as a run-on line. Sending the parts
 * lets the panel lay them out the way the list view does, and carry the pitch,
 * which a glance at a day is largely for.
 */
type DayRow = { singer: string; bhajan: string | null; pitch: string | null };

/**
 * A day holds a LIST of sessions now, not one.
 *
 * Session.date stopped being unique on 2026-08-12 — "some days there are 3
 * sessions" — so the calendar carries each one with its own time, kind and
 * rows. Collapsing them to a total would say a day is busy without saying it
 * is busy twice, which is the thing worth knowing.
 */
type DaySession = {
  id: string;
  startsAt: string | null;
  categoryName: string | null;
  entries: number;
  rows: DayRow[];
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const m = url.searchParams.get("m") || "";
  const parsed = parseMonth(m);
  if (!parsed) {
    return NextResponse.json({ dayInfo: {} }, { status: 200 });
  }

  const monthStart = new Date(Date.UTC(parsed.y, parsed.mo, 1, 0, 0, 0));
  const monthEndExclusive = new Date(Date.UTC(parsed.y, parsed.mo + 1, 1, 0, 0, 0));

  const sessions = await prisma.session.findMany({
    where: { date: { gte: monthStart, lt: monthEndExclusive } },
    select: {
      id: true,
      date: true,
      startsAt: true,
      category: { select: { name: true } },
      _count: { select: { slots: true } },
      slots: {
        select: {
          bhajanTitle: true,
          confirmedPitch: true,
          bhajan: { select: { title: true } },
          festivalBhajanTitle: true,
          singer: { select: { name: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        // Six covers a normal session outright; longer ones say "+N more".
        take: 6,
      },
    },
    orderBy: { date: "asc" },
  });

  const dayInfo: Record<string, { sessions: DaySession[] }> = {};
  for (const s of sessions) {
    /*
     * A session record can outlive its contents: build one, empty it, and the
     * row stays behind. Those were drawing a small white dot on the calendar,
     * which read as "something is on" when nothing is. Sailavan: treat them as
     * a day with no session at all.
     *
     * The record is left alone — tapping the day still finds it rather than
     * creating a second one — it simply stops being advertised.
     */
    if ((s._count.slots ?? 0) === 0) continue;
    const value: DaySession = {
      id: s.id,
      startsAt: s.startsAt,
      categoryName: s.category?.name ?? null,
      entries: s._count.slots ?? 0,
      rows: s.slots.map((x) => ({
        singer: x.singer?.name ?? "Unassigned",
        bhajan: x.bhajan?.title ?? x.bhajanTitle ?? x.festivalBhajanTitle ?? null,
        pitch: x.confirmedPitch,
      })),
    };
    const utcKey = isoDateUTC(s.date);
    const localKey = isoDateLocal(s.date);

    (dayInfo[utcKey] ??= { sessions: [] }).sessions.push(value);
    // The local key exists because a browser east or west of UTC can read the
    // same date differently; it points at the same day's sessions.
    if (localKey !== utcKey) dayInfo[localKey] ??= dayInfo[utcKey];
  }


  return NextResponse.json({ dayInfo }, { status: 200 });
}
