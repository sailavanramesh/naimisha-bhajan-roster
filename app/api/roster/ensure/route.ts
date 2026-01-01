import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function parseISODateUTC(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const dateISO = String(body?.date || "");
  const day = parseISODateUTC(dateISO);
  if (!day) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const nextDay = addDaysUTC(day, 1);

  // Find existing session for that date (day-bucket)
  const existing = await prisma.session.findFirst({
    where: { date: { gte: day, lt: nextDay } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ sessionId: existing.id }, { status: 200 });
  }

  const created = await prisma.session.create({
    data: { date: day },
    select: { id: true },
  });

  return NextResponse.json({ sessionId: created.id }, { status: 200 });
}
