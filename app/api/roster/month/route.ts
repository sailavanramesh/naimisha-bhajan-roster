import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function parseMonth(month: string) {
  // month = "YYYY-MM"
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  const start = new Date(Date.UTC(y, mo, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo + 1, 1, 0, 0, 0));
  return { start, end };
}

function isoDayUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || "";
  const range = parseMonth(month);

  if (!range) {
    return NextResponse.json({ days: {} }, { status: 400 });
  }

  const sessions = await prisma.session.findMany({
    where: {
      date: { gte: range.start, lt: range.end },
    },
    select: {
      id: true,
      date: true,
      _count: { select: { singers: true } },
    },
    orderBy: { date: "asc" },
  });

  // days[YYYY-MM-DD] = { sessionId, entries, hasSession }
  const days: Record<string, { sessionId: string; entries: number; hasSession: boolean }> = {};

  for (const s of sessions) {
    const key = isoDayUTC(s.date);
    const entries = s._count.singers ?? 0;
    days[key] = { sessionId: s.id, entries, hasSession: true };
  }

  return NextResponse.json({ days });
}
