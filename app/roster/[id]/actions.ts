"use server";

import { prisma } from "@/lib/db";
import { rosterBlockReason } from "@/lib/rosterEligibility";
import { notifyAboutSession } from "@/lib/notifySession";
import { rosteredSingerIds, notifyRemovals } from "@/lib/notifyRemoval";
import { recordSungAsKnown } from "@/lib/repertoireFromHistory";
import { noteRosterChange } from "@/lib/rosterChange";
import { announceRosterIfSettled } from "@/lib/announceRosters";
import { notifyHarmoniumIfReady } from "@/lib/notifyHarmonium";
import { requireCapability, can } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";


/**
 * Note what is absent: `recommendedPitch` and `raga`.
 *
 * Both are derived from the bhajan (CLAUDE.md rule 5) and are no longer stored
 * on the slot. The grid still displays a recommendation; it just computes it
 * rather than round-tripping it. `historicalRecommendedPitch` is historical
 * record and is never written from the UI.
 */
export type SingerRowInput = {
  id?: string | null;
  singerId: string;
  bhajanId: string | null;
  bhajanTitle: string | null;
  festivalBhajanTitle: string | null;
  confirmedPitch: string | null;
  alternativeTablaPitch: string | null;
  /**
   * The row's `updatedAt` as it was when this browser loaded the page.
   * Used to detect that somebody else saved in the meantime — see
   * `upsertSessionSingerRows`.
   */
  updatedAt?: string | null;
};

/**
 * What a save gives back.
 *
 * A refusal is a RESULT, never a thrown error. Next strips the message from
 * anything thrown out of a Server Action in a production build and replaces it
 * with "An error occurred in the Server Components render…", so throwing meant
 * the careful sentence explaining what happened never reached anybody — the one
 * situation where the explanation matters most.
 *
 * On success it returns the saved rows' stamps in position order. The grid
 * holds its rows in local state seeded once, so without these it would keep
 * sending the `updatedAt` values the page loaded with and the SECOND save in a
 * row would collide with the first one's own writes.
 */
export type SaveRowsResult =
  | { ok: true; stamps: { id: string; updatedAt: string }[] }
  | { ok: false; error: string };

/**
 * A refusal raised inside the transaction, so it rolls back, and turned into a
 * result outside it. Not exported: a "use server" file may only export async
 * functions.
 */
class Refusal extends Error {}

export async function updateSessionNotes(sessionId: string, notes: string) {
  await requireCapability("editSessionNotes");
  await prisma.session.update({
    where: { id: sessionId },
    data: { notes },
  });
  revalidatePath(`/roster/${sessionId}`);
}

export async function addInstrumentRow(sessionId: string, instrument: string, person: string) {
  await requireCapability("assignSingers");
  const inst = instrument.trim();
  const p = person.trim();

  if (!inst) return;

  await prisma.sessionInstrument.create({
    data: {
      sessionId,
      instrument: inst,
      person: p ? p : null,
    },
  });

  revalidatePath(`/roster/${sessionId}`);
}

export async function deleteInstrumentRow(id: string) {
  await requireCapability("assignSingers");
  const row = await prisma.sessionInstrument.findUnique({ where: { id } });
  if (!row) return;

  await prisma.sessionInstrument.delete({ where: { id } });
  revalidatePath(`/roster/${row.sessionId}`);
}

export async function deleteSingerRow(id: string) {
  await requireCapability("assignSingers");
  const row = await prisma.sessionSlot.findUnique({ where: { id } });
  if (!row) return;

  const before = await rosteredSingerIds(row.sessionId);
  await prisma.sessionSlot.delete({ where: { id } });
  await notifyRemovals(row.sessionId, before);
  await noteRosterChange(row.sessionId, before);

  revalidatePath(`/roster/${row.sessionId}`);
}

/**
 * A member may correct WHICH BHAJAN is in a slot, and nothing else.
 *
 * Enforced here rather than by hiding the singer dropdown: a hidden control is
 * not a permission. A member's payload is reduced to the bhajan fields and the
 * existing singer is preserved, so a crafted POST cannot reassign anybody.
 */
export async function upsertSessionSingerRows(
  sessionId: string,
  rows: SingerRowInput[],
): Promise<SaveRowsResult> {
  const role = await requireCapability("editSlotBhajan");
  // Read before the transaction: saving the grid is also how somebody gets
  // swapped out of a row, which is a removal with no delete anywhere.
  const rosteredBefore = await rosteredSingerIds(sessionId);

  if (!can(role, "assignSingers")) {
    const existing = await prisma.sessionSlot.findMany({
      where: { sessionId },
      select: { id: true, singerId: true, confirmedPitch: true, alternativeTablaPitch: true, position: true },
    });
    const byId = new Map(existing.map((e) => [e.id, e]));

    // Anything a member is not allowed to change is taken from the database,
    // not from what they sent.
    rows = rows
      .filter((r) => r.id && byId.has(r.id))
      .map((r) => {
        const current = byId.get(r.id as string)!;
        return {
          ...r,
          singerId: current.singerId ?? "",
          confirmedPitch: current.confirmedPitch,
          alternativeTablaPitch: current.alternativeTablaPitch,
        };
      });

    if (rows.length !== existing.length) {
      return {
        ok: false,
        error:
          "Members can change which bhajan is in a slot, but not add, remove or " +
          "reorder slots. Ask an editor for those.",
      };
    }
    // Preserve the existing order: a member reordering would move singers.
    rows.sort((a, b) => (byId.get(a.id as string)!.position) - (byId.get(b.id as string)!.position));
  }

  // `.then/.catch` rather than a `try` block around the whole transaction, so
  // the body below keeps its indentation and stays readable.
  const refusal = await prisma.$transaction(async (tx) => {
    const existingIds = rows
      .filter((r) => r.id && !String(r.id).startsWith("new_"))
      .map((r) => r.id as string);

    /*
     * OPTIMISTIC CONCURRENCY.
     *
     * Several people edit a session at once — the coordinator on a laptop, a
     * singer on a phone. This used to be last-writer-wins on every field,
     * which meant a stale tab could silently overwrite a confirmedPitch
     * somebody had just recorded. Those values exist nowhere else.
     *
     * So: every row carries the `updatedAt` it had when the page was loaded.
     * If any row has moved on since, the whole save is refused and nothing is
     * written. Refusing is the right trade — a save you have to redo is a
     * nuisance, a pitch quietly lost is not recoverable.
     */
    /*
     * Nobody without a recorded voice may hold a slot. The grid's dropdown is
     * already filtered, but a stale tab could post an id that has since become
     * ineligible, and hiding a control is not a rule.
     */
    const proposedSingerIds = [...new Set(rows.map((r) => r.singerId).filter(Boolean))] as string[];
    if (proposedSingerIds.length > 0) {
      const proposed = await tx.singer.findMany({
        where: { id: { in: proposedSingerIds } },
        select: { name: true, gender: true },
      });
      for (const p of proposed) {
        const reason = rosterBlockReason(p);
        if (reason) throw new Refusal(reason);
      }
    }

    const stamped = rows.filter(
      (r) => r.id && !String(r.id).startsWith("new_") && r.updatedAt,
    );
    if (stamped.length > 0) {
      const current = await tx.sessionSlot.findMany({
        where: { id: { in: stamped.map((r) => r.id as string) } },
        select: { id: true, updatedAt: true },
      });
      const now = new Map(current.map((c) => [c.id, c.updatedAt.getTime()]));
      const clashed = stamped.filter((r) => {
        const seen = now.get(r.id as string);
        // A row that has vanished is handled below by the P2025 catch.
        if (seen === undefined) return false;
        return seen !== new Date(r.updatedAt as string).getTime();
      });
      if (clashed.length > 0) {
        throw new Refusal(
          `Somebody else saved this session while you had it open, so nothing was ` +
            `written — your changes are still on screen. Open the session again in a ` +
            `new tab to see theirs, then re-apply yours.`,
        );
      }
    }

    // `position` is unique per session, and Postgres checks that per statement
    // rather than at commit. Reordering rows in place would therefore collide
    // the moment two rows briefly share a position. Park the surviving rows on
    // negative positions first, then assign the real ones.
    if (existingIds.length > 0) {
      await tx.$executeRaw`
        UPDATE "SessionSlot"
        SET "position" = -"position"
        WHERE "sessionId" = ${sessionId}
          AND "position" > 0
      `;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const isNew = !r.id || String(r.id).startsWith("new_");

      const data = {
        sessionId,
        singerId: r.singerId,
        bhajanId: r.bhajanId,
        bhajanTitle: r.bhajanTitle,
        festivalBhajanTitle: r.festivalBhajanTitle,
        confirmedPitch: r.confirmedPitch,
        alternativeTablaPitch: r.alternativeTablaPitch,
        position: i + 1,
      };

      if (isNew) {
        await tx.sessionSlot.create({ data });
      } else {
        try {
          await tx.sessionSlot.update({
            where: { id: r.id as string },
            data,
          });
        } catch (e) {
          // If the row was deleted in another tab / earlier click, don't crash
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
            continue;
          }
          throw e;
        }
      }
    }

    // Anything still parked was dropped from the grid without going through
    // deleteSingerRow. Give it a real position rather than leaving it negative.
    const stranded = await tx.sessionSlot.findMany({
      where: { sessionId, position: { lt: 0 } },
      orderBy: { position: "desc" },
      select: { id: true },
    });
    let next = rows.length;
    for (const s of stranded) {
      next += 1;
      await tx.sessionSlot.update({ where: { id: s.id }, data: { position: next } });
    }
  })
    .then(() => null)
    .catch((e) => {
      if (e instanceof Refusal) return e.message;
      throw e;
    });

  if (refusal) return { ok: false, error: refusal };

  /*
   * The stamps the grid needs to save again without reloading.
   *
   * Positions 1…rows.length are this save's rows, in the order they were sent;
   * anything beyond that is a stranded row parked above them, which the grid
   * is not showing.
   */
  const saved = await prisma.sessionSlot.findMany({
    where: { sessionId, position: { gt: 0, lte: rows.length } },
    orderBy: { position: "asc" },
    select: { id: true, updatedAt: true },
  });

  // Saving the grid can be the moment somebody is first rostered — or the
  // moment somebody is quietly replaced.
  await notifyRemovals(sessionId, rosteredBefore);
  await noteRosterChange(sessionId, rosteredBefore);
  await notifyAboutSession(sessionId);
  // Every save asks whether this roster has settled. Almost always no; when it
  // is yes, the group hears about it now rather than at the next hourly tick.
  await announceRosterIfSettled(sessionId);
  // Same moment, different audience: the harmonium wants the bhajans and
  // shrutis, and only once every row has both. See lib/notifyHarmonium.ts.
  await notifyHarmoniumIfReady(sessionId);
  // Singing something is the strongest evidence there is that a person can
  // sing it, so a saved past session adds to their list.
  await recordSungAsKnown(sessionId);

  revalidatePath(`/roster/${sessionId}`);

  return {
    ok: true,
    stamps: saved.map((s) => ({ id: s.id, updatedAt: s.updatedAt.toISOString() })),
  };
}
