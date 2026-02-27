import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function parseISODateUTC(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const date = String(body?.date || "");
  const dt = parseISODateUTC(date);
  if (!dt) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const existing = await prisma.session.findUnique({
    where: { date: dt },
    select: { id: true },
  });

  if (existing) return NextResponse.json({ sessionId: existing.id });

  const created = await prisma.session.create({
    data: { date: dt },
    select: { id: true },
  });

  return NextResponse.json({ sessionId: created.id });
}