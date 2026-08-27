import { prisma } from "@/lib/db";
import { RepertoireKind } from "@prisma/client";
import { hasBeenSung, melbourneNowLocal } from "@/lib/sungCutoff";
import { NOT_ARCHIVED } from "./archive";
import { decideFromSung, type ListedRow } from "./repertoirePromotion";

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
 * 2. FORWARDS ONLY. Singing it moves it to "Know it" from "Want to learn" or
 *    "Learning"; nothing ever moves back, and a row already at "Know it" is
 *    left exactly as it is.
 *
 *    This rule USED to be "never downgrade", implemented as never touching an
 *    existing row at all — so a bhajan somebody had listed as wanting to learn
 *    stayed there after they sang it. Sailavan, 2026-08-27, on Prithvi and
 *    "Sai Guna Gao Sai Naam": "it should automatically go into the known and
 *    sung buckets". lib/repertoireGuard.ts had already settled the same
 *    argument the same way for anything added AFTER the singing; this brings
 *    the rows written before it into line. See lib/repertoirePromotion.ts.
 * 3. NEVER OVERWRITE A PITCH. A blank preferredPitch is filled from what they
 *    sang; one they chose is left alone. Same for a note they wrote.
 * 4. NEVER BREAK THE SAVE. Same rule as the notifications — this runs after
 *    the roster is written and any failure is swallowed. One bhajan that
 *    cannot be written must not take the rest of the session with it, so each
 *    row is written on its own.
 */
export async function recordSungAsKnown(
  sessionId: string,
): Promise<{ added: number; promoted: number; pitchFilled: number; skipped?: string }> {
  const nothing = { added: 0, promoted: 0, pitchFilled: 0 };

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
      select: {
        id: true,
        singerId: true,
        bhajanId: true,
        kind: true,
        preferredPitch: true,
        note: true,
      },
    });
    /*
     * EVERY row for a pair, not one of them.
     *
     * The unique key is (singer, kind, title), so the same bhajan can sit at
     * two stages at once — the seed built these lists from several sheets. This
     * used to keep whichever row the map saw last, which decided nothing
     * because the only question asked was "is there one". Now that a row can
     * MOVE, which row moves matters. See decideFromSung.
     */
    const have = new Map<string, ListedRow[]>();
    for (const e of existing) {
      const key = `${e.singerId}|${e.bhajanId}`;
      have.set(key, [...(have.get(key) ?? []), e]);
    }

    let added = 0;
    let promoted = 0;
    let pitchFilled = 0;

    for (const slot of session.slots) {
      const key = `${slot.singerId}|${slot.bhajanId}`;
      const rows = have.get(key) ?? [];
      const decision = decideFromSung(rows, slot.confirmedPitch);
      if (decision === null) continue;

      const title = slot.bhajan?.title;
      if (decision.action === "create" && !title) continue;

      /*
       * ONE ROW AT A TIME, each in its own try.
       *
       * A promotion can collide where nothing else could: the unique key is on
       * the TITLE, so a person carrying a free-text "known" row from the sheet
       * AND a linked "want to learn" row for the same title has two rows that
       * cannot both be known. That is a stray from the import, not something to
       * repair from here — but it must not stop the next singer's bhajan from
       * being recorded, which is what one try around the whole loop did.
       */
      try {
        if (decision.action === "create") {
          await prisma.singerRepertoire.create({
            data: {
              singerId: slot.singerId!,
              bhajanId: slot.bhajanId,
              title: title!,
              kind: RepertoireKind.known,
              preferredPitch: slot.confirmedPitch,
              note: `Added from the roster — sung on ${dateISO}.`,
            },
          });
          added++;
          // So a bhajan sung twice in one session is not created twice.
          have.set(key, [
            {
              id: "",
              kind: RepertoireKind.known,
              preferredPitch: slot.confirmedPitch,
              note: null,
            },
          ]);
          continue;
        }

        await prisma.singerRepertoire.update({
          where: { id: decision.id },
          data: {
            ...(decision.promote ? { kind: RepertoireKind.known } : {}),
            ...(decision.fillPitch ? { preferredPitch: slot.confirmedPitch } : {}),
            ...(decision.setNote
              ? { note: `Moved to "Know it" from the roster — sung on ${dateISO}.` }
              : {}),
          },
        });
        if (decision.promote) promoted++;
        if (decision.fillPitch) pitchFilled++;

        // Keep the map honest for a repeated pair in the same session.
        const row = rows.find((r) => r.id === decision.id);
        if (row) {
          if (decision.promote) row.kind = RepertoireKind.known;
          if (decision.fillPitch) row.preferredPitch = slot.confirmedPitch;
        }
      } catch (e) {
        console.error("recordSungAsKnown could not write one row", key, e);
      }
    }

    return { added, promoted, pitchFilled };
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
): Promise<{ sessions: number; added: number; promoted: number; pitchFilled: number }> {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  from.setUTCHours(0, 0, 0, 0);

  const nowLocal = melbourneNowLocal(now);

  const sessions = await prisma.session.findMany({
    where: { ...NOT_ARCHIVED, date: { gte: from }, slots: { some: { singerId: { not: null }, bhajanId: { not: null } } } },
    select: { id: true, date: true, startsAt: true },
    orderBy: { date: "asc" },
  });

  let touched = 0;
  let added = 0;
  let promoted = 0;
  let pitchFilled = 0;

  for (const s of sessions) {
    const dateISO = s.date.toISOString().slice(0, 10);
    if (!hasBeenSung(dateISO, s.startsAt, nowLocal)) continue;
    const result = await recordSungAsKnown(s.id);
    touched++;
    added += result.added;
    promoted += result.promoted;
    pitchFilled += result.pitchFilled;
  }

  return { sessions: touched, added, promoted, pitchFilled };
}
