import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return isNaN(dt.getTime()) ? null : dt;
}

function addDaysUTC(d: Date, n: number) {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const canEdit = cookieStore.get("edit")?.value === "1";

    if (!canEdit) {
      return NextResponse.json({ error: "Read-only" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const iso = String(body?.date || "").trim(); // "YYYY-MM-DD"
    const start = parseISODate(iso);

    if (!start) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const endExclusive = addDaysUTC(start, 1);

    // Find existing session for that day (UTC day bucket)
    const existing = await prisma.session.findFirst({
      where: { date: { gte: start, lt: endExclusive } },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ id: existing.id, created: false });
    }

    const created = await prisma.session.create({
      data: { date: start },
      select: { id: true },
    });

    return NextResponse.json({ id: created.id, created: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
