import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import { hasBeenSung, melbourneNowLocal } from "@/lib/sungCutoff";

/**
 * lib/repertoireFromHistory.ts — singing something puts it on your list.
 *
 * Sailavan, 2026-08-12: "if a person sings a bhajan in a session, can it go
 * into their known bhajans as well (storing the pitch as well)" — and then,
 * about backfilling old sessions, "it should automatically add it to the
 * relative buckets in the backend right??" Yes. This is that.
 *
 * The roster turned out to know far more than the lists did: when this was
 * first run over the seeded history, 388 of the 512 (singer, bhajan) pairs
 * that had actually been sung were on nobody's list. Every session saved from
 * now on — including the historical ones being typed in — keeps that gap from
 * reopening.
 *
 * Four rules, all about not overwriting a person's own words:
 *
 * 1. ONLY WHAT WAS SUNG. Until two hours after the session started, it is a
 *    plan; a pitch typed while planning is not evidence that anybody sang
 *    anything. This used to compare DATES, so a 7pm session counted from
 *    midnight — Sailavan caught it. See lib/sungCutoff.ts.
 * 2. NEVER DOWNGRADE. If the bhajan is already on their list at any stage it
 *    stays where it is. Somebody who has it as "learning" has said something
 *    about themselves that a roster row does not overrule.
 * 3. NEVER OVERWRITE A PITCH. A blank preferredPitch is filled from what they
 *    sang; one they chose is left alone.
 * 4. NEVER BREAK THE SAVE. Same rule as the notifications — this runs after
 *    the roster is written and any failure is swallowed.
 */
export async function recordSungAsKnown(
  sessionId: string,
): Promise<{ added: number; pitchFilled: number; skipped?: string }> {
  const nothing = { added: 0, pitchFilled: 0 };

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        date: true,
        startsAt: true,
        slots: {
          where: { singerId: { not: null }, bhajanId: { not: null } },
          select: {
            singerId: true,
            bhajanId: true,
            confirmedPitch: true,
            bhajan: { select: { title: true } },
          },
        },
      },
    });
    if (!session) return { ...nothing, skipped: "no such session" };

    const dateISO = session.date.toISOString().slice(0, 10);
    if (!hasBeenSung(dateISO, session.startsAt)) {
      return { ...nothing, skipped: "session has not happened yet" };
    }
    if (session.slots.length === 0) return nothing;

    const existing = await prisma.singerRepertoire.findMany({
      where: {
        singerId: { in: session.slots.map((s) => s.singerId!) },
        bhajanId: { in: session.slots.map((s) => s.bhajanId!) },
      },
      select: { id: true, singerId: true, bhajanId: true, preferredPitch: true },
    });
    const have = new Map(existing.map((e) => [`${e.singerId}|${e.bhajanId}`, e]));

    let added = 0;
    let pitchFilled = 0;

    for (const slot of session.slots) {
      const key = `${slot.singerId}|${slot.bhajanId}`;
      const seen = have.get(key);

      if (seen) {
        if (!seen.preferredPitch && slot.confirmedPitch) {
          await prisma.singerRepertoire.update({
            where: { id: seen.id },
            data: { preferredPitch: slot.confirmedPitch },
          });
          pitchFilled++;
        }
        continue;
      }

      const title = slot.bhajan?.title;
      if (!title) continue;

      await prisma.singerRepertoire.create({
        data: {
          singerId: slot.singerId!,
          bhajanId: slot.bhajanId,
          title,
          kind: RepertoireKind.known,
          preferredPitch: slot.confirmedPitch,
          note: `Added from the roster — sung on ${dateISO}.`,
        },
      });
      // Two rows for the same person and bhajan cannot both be created here,
      // because the map is consulted first — but a concurrent save could. The
      // list de-duplicates on read, and a stray duplicate is removable.
      have.set(key, {
        id: "",
        singerId: slot.singerId!,
        bhajanId: slot.bhajanId,
        preferredPitch: slot.confirmedPitch,
      });
      added++;
    }

    return { added, pitchFilled };
  } catch (e) {
    console.error("recordSungAsKnown failed", e);
    return { ...nothing, skipped: "error" };
  }
}

/**
 * Catch the sessions that were rostered in advance and never touched again.
 *
 * `recordSungAsKnown` runs when a roster is SAVED, and the ordinary way to
 * roster is days ahead — at which point the session has not happened, so
 * nothing is recorded. If nobody edits it afterwards, and often nobody does,
 * what was sung never reaches anybody's list. Tightening the cutoff to two
 * hours after the start makes that certain rather than likely: at save time
 * the answer is now almost always "not yet".
 *
 * So the clock finishes the job. This runs from the hourly job that already
 * sends the nudges (app/api/nudges/run), and asks the same question of every
 * session that has recently finished. Re-running it is free — the recording
 * step adds only what is missing.
 *
 * `days` bounds the sweep so the hourly run stays cheap. A one-off backfill
 * passes a large number.
 */
export async function syncSungRepertoire(
  days = 21,
): Promise<{ sessions: number; added: number; pitchFilled: number }> {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  from.setUTCHours(0, 0, 0, 0);

  const nowLocal = melbourneNowLocal(now);

  const sessions = await prisma.session.findMany({
    where: { date: { gte: from }, slots: { some: { singerId: { not: null }, bhajanId: { not: null } } } },
    select: { id: true, date: true, startsAt: true },
    orderBy: { date: "asc" },
  });

  let touched = 0;
  let added = 0;
  let pitchFilled = 0;

  for (const s of sessions) {
    const dateISO = s.date.toISOString().slice(0, 10);
    if (!hasBeenSung(dateISO, s.startsAt, nowLocal)) continue;
    const result = await recordSungAsKnown(s.id);
    touched++;
    added += result.added;
    pitchFilled += result.pitchFilled;
  }

  return { sessions: touched, added, pitchFilled };
}
