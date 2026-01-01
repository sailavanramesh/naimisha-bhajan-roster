import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function parseISODateOnly(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const start = new Date(Date.UTC(y, mo, d, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, d + 1, 0, 0, 0));
  return { start, end };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "";
  const range = parseISODateOnly(date);

  if (!range) return NextResponse.json({ sessionId: null }, { status: 400 });

  const s = await prisma.session.findFirst({
    where: { date: { gte: range.start, lt: range.end } },
    select: { id: true },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ sessionId: s?.id ?? null });
}
