import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRole, can } from "@/lib/auth";
import { defaultSessionOf, USUAL_START } from "@/lib/sessionsOfDay";

export const runtime = "nodejs";

function parseISODateUTC(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * "Give me the session on this day", from the calendar.
 *
 * Two things changed on 2026-08-12. A day can hold several sessions, so
 * "the session" means the one nearest the usual 7pm rather than the first —
 * see lib/sessionsOfDay.ts. And `another: true` says to add one regardless,
 * which is how a second session gets onto a day at all.
 *
 * It also now checks a capability. It creates rows and had no check of any
 * kind: the calendar only called it for an editor, but hiding the caller is
 * not a permission.
 */
export async function POST(req: NextRequest) {
  const role = await getRole();
  if (!can(role, "buildSessions")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const date = String(body?.date || "");
  const another = body?.another === true;
  const dt = parseISODateUTC(date);
  if (!dt) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  if (!another) {
    const onThatDay = await prisma.session.findMany({
      where: { date: dt },
      select: { id: true, startsAt: true },
    });
    const existing = defaultSessionOf(onThatDay);
    if (existing) return NextResponse.json({ sessionId: existing.id });
  }

  // New sessions start at the usual evening time, because almost all of them
  // do. A morning one is then one field to change rather than one to fill in.
  const created = await prisma.session.create({
    data: { date: dt, startsAt: USUAL_START },
    select: { id: true },
  });

  return NextResponse.json({ sessionId: created.id });
}
