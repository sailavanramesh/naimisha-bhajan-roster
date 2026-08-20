/**
 * lib/notifyUnavailable.ts — telling the coordinators that a slot has emptied.
 *
 * Somebody marking themselves away for a night they are already rostered on is
 * the one availability event that needs pushing at a person. Everything else
 * can wait to be looked at; this cannot, because the roster still shows their
 * name and nobody would find out until the night.
 *
 * It goes to coordinators and owners, and NOT to the singer, who already knows.
 * It carries the singer's name and the date and nothing else — marking a date
 * away says nothing about why, and this notification must not become the leak
 * that the rest of the feature was carefully built to avoid.
 */

import { prisma } from "./db";
import { pushToSingers } from "./push";
import { unavailableWhileRosteredNotification } from "./notify";
import { LIVE_SESSION } from "./archive";

export type Clash = {
  sessionId: string;
  dateISO: string;
  singerId: string;
  singerName: string;
};

/**
 * Which of these dates does this singer already hold a slot on?
 *
 * Archived sessions are excluded — a roster nobody is going to sing is not a
 * gap anybody needs to fill.
 */
export async function clashesFor(
  singerId: string,
  dateISOs: readonly string[],
): Promise<Clash[]> {
  if (dateISOs.length === 0) return [];

  const dates = dateISOs.map((iso) => new Date(`${iso}T00:00:00.000Z`));
  const slots = await prisma.sessionSlot.findMany({
    where: {
      singerId,
      session: { date: { in: dates }, ...LIVE_SESSION },
    },
    select: {
      session: { select: { id: true, date: true } },
      singer: { select: { id: true, name: true } },
    },
  });

  // One notification per session, not per slot: somebody singing three bhajans
  // that night has dropped out once.
  const bySession = new Map<string, Clash>();
  for (const s of slots) {
    if (!s.session || !s.singer) continue;
    bySession.set(s.session.id, {
      sessionId: s.session.id,
      dateISO: s.session.date.toISOString().slice(0, 10),
      singerId: s.singer.id,
      singerName: s.singer.name,
    });
  }
  return [...bySession.values()];
}

/** Coordinators and owners — the people who can actually fill the gap. */
export async function editorSingerIds(): Promise<string[]> {
  const rows = await prisma.singer.findMany({
    where: { role: { in: ["coordinator", "owner"] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Tell the coordinators, if there is anything to tell them.
 *
 * Never throws into the caller: this runs at the end of somebody saving their
 * own availability, and a push service having a bad day must not make it look
 * as though their dates failed to save. The dates are the point; the
 * notification is a courtesy on top.
 */
export async function notifyEditorsOfClashes(
  singerId: string,
  dateISOs: readonly string[],
): Promise<{ clashes: number; sent: number }> {
  try {
    const clashes = await clashesFor(singerId, dateISOs);
    if (clashes.length === 0) return { clashes: 0, sent: 0 };

    const editors = (await editorSingerIds()).filter((id) => id !== singerId);
    if (editors.length === 0) return { clashes: clashes.length, sent: 0 };

    let sent = 0;
    for (const clash of clashes) {
      const result = await pushToSingers(
        editors,
        unavailableWhileRosteredNotification({
          singerName: clash.singerName,
          sessionId: clash.sessionId,
          dateISO: clash.dateISO,
        }),
      );
      sent += result.sent;
    }
    return { clashes: clashes.length, sent };
  } catch {
    return { clashes: 0, sent: 0 };
  }
}
