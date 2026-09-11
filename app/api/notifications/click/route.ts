import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Records that a person tapped a notification for a specific session.
 *
 * Called from the service worker's `notificationclick` handler — it has no
 * auth context, so this endpoint accepts any POST and trusts the singerId +
 * sessionId from the push payload (both were injected server-side when the
 * notification was sent, so they are not user-supplied).
 *
 * `updateMany` rather than `update` because a singer can have multiple
 * SessionNotice rows for the same session (rostered, nudge_morning, nudge, …)
 * and a click on ANY notification from that session counts as "seen".
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).singerId !== "string" ||
    typeof (body as Record<string, unknown>).sessionId !== "string"
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { singerId, sessionId } = body as { singerId: string; sessionId: string };

  await prisma.sessionNotice.updateMany({
    where: { singerId, sessionId, clickedAt: null },
    data: { clickedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
