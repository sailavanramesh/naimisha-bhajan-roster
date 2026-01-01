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
    select: { id: true, date: true, _count: { select: { singers: true } } },
    orderBy: { date: "asc" },
  });

  const dayInfo: Record<string, { sessionId: string; entries: number }> = {};
  for (const s of sessions) {
    dayInfo[isoDateUTC(s.date)] = { sessionId: s.id, entries: s._count.singers ?? 0 };
  }

  return NextResponse.json({ dayInfo }, { status: 200 });
}
