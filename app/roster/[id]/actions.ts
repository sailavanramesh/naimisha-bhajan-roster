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
import { mergeRow, describeConflicts, type RowConflict } from "@/lib/rowMerge";


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
  /**
   * The row AS THIS BROWSER LOADED IT, so a save can tell "I set this" from "I
   * am echoing back what I was shown".
   *
   * Without it every field a browser sends looks like an assertion, which is
   * why last-writer-wins loses pitches and why refusing the whole save was the
   * only safe alternative. See lib/rowMerge.ts.
   */
  base?: {
    singerId?: string;
    bhajanId?: string | null;
    bhajanTitle?: string | null;
    festivalBhajanTitle?: string | null;
    confirmedPitch?: string | null;
    alternativeTablaPitch?: string | null;
  } | null;
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
  | {
      ok: true;
      stamps: { id: string; updatedAt: string }[];
      /**
       * Rows somebody else had also changed, where the two sets of edits did
       * not overlap and were merged. Worth saying so — a value changing under
       * you without explanation is worse than a refusal.
       */
      merged?: RowConflict[];
      /**
       * Rows left alone because the same field was changed two ways. The save
       * still happened for everything else.
       */
      conflicts?: RowConflict[];
      /** The summary to show, when there is one. */
      notice?: string;
    }
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

    /*
     * Anything they are not allowed to change is taken from the database rather
     * than from what they sent — but per FIELD, not in a lump.
     *
     * `confirmedPitch` used to be reverted here for everybody without
     * `assignSingers`, which silently threw away a member's edit while the grid
     * happily offered them the field and reported a successful save. It is now
     * asked about on its own terms, so the rule in lib/capabilities.ts is the
     * only place the answer lives.
     *
     * The two still reverted are controls the grid does not render for a
     * member, so nothing they can see is being discarded.
     */
    const mayEditPitch = can(role, "editConfirmedPitch");
    rows = rows
      .filter((r) => r.id && byId.has(r.id))
      .map((r) => {
        const current = byId.get(r.id as string)!;
        return {
          ...r,
          singerId: current.singerId ?? "",
          confirmedPitch: mayEditPitch ? r.confirmedPitch : current.confirmedPitch,
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

  /*
   * Filled inside the transaction, read after it. Rows somebody else also
   * touched: `merged` where the edits combined, `conflicts` where one field was
   * changed two ways, and `leaveAlone` for the ids that must not be written.
   */
  const merged: RowConflict[] = [];
  const conflicts: RowConflict[] = [];
  const leaveAlone = new Set<string>();

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
        select: {
          id: true,
          updatedAt: true,
          position: true,
          singerId: true,
          bhajanId: true,
          bhajanTitle: true,
          festivalBhajanTitle: true,
          confirmedPitch: true,
          alternativeTablaPitch: true,
          singer: { select: { name: true } },
        },
      });
      const byId = new Map(current.map((c) => [c.id, c]));
      const clashed = stamped.filter((r) => {
        const seen = byId.get(r.id as string);
        // A row that has vanished is handled below by the P2025 catch.
        if (seen === undefined) return false;
        return seen.updatedAt.getTime() !== new Date(r.updatedAt as string).getTime();
      });

      /*
       * A THREE-WAY MERGE, not a refusal.
       *
       * It used to refuse the whole save the moment any row had moved on. That
       * protected the pitches — the right instinct — but it made two people
       * working on one session at once unworkable, which is exactly what a live
       * Sunday is. Sailavan, 2026-08-23: "otherwise this is an issue in the
       * live."
       *
       * So each row that moved is merged field by field against what this
       * browser loaded. Different rows, or different fields on one row, both
       * just work. Only a genuine disagreement about one field is held back,
       * and that row is left EXACTLY as the other person left it — never
       * guessed at, never half-written. The rule lives in lib/rowMerge.ts with
       * its own tests, because it decides whether a confirmedPitch survives.
       */
      for (const r of clashed) {
        const theirs = byId.get(r.id as string)!;
        const outcome = mergeRow(
          r.base ?? null,
          {
            singerId: r.singerId,
            bhajanId: r.bhajanId,
            bhajanTitle: r.bhajanTitle,
            festivalBhajanTitle: r.festivalBhajanTitle,
            confirmedPitch: r.confirmedPitch,
            alternativeTablaPitch: r.alternativeTablaPitch,
          },
          {
            singerId: theirs.singerId ?? "",
            bhajanId: theirs.bhajanId,
            bhajanTitle: theirs.bhajanTitle,
            festivalBhajanTitle: theirs.festivalBhajanTitle,
            confirmedPitch: theirs.confirmedPitch,
            alternativeTablaPitch: theirs.alternativeTablaPitch,
          },
        );

        const summary: RowConflict = {
          position: theirs.position,
          singerName: theirs.singer?.name ?? null,
          fields: outcome.clashes,
        };

        if (outcome.clashes.length > 0) {
          // Their row stands. Writing a merge with a known disagreement in it
          // would be inventing an answer nobody gave.
          conflicts.push(summary);
          leaveAlone.add(r.id as string);
          continue;
        }

        // Merged cleanly. Write the combination rather than what was sent.
        r.singerId = outcome.merged.singerId;
        r.bhajanId = outcome.merged.bhajanId;
        r.bhajanTitle = outcome.merged.bhajanTitle;
        r.festivalBhajanTitle = outcome.merged.festivalBhajanTitle;
        r.confirmedPitch = outcome.merged.confirmedPitch;
        r.alternativeTablaPitch = outcome.merged.alternativeTablaPitch;
        if (outcome.changedByMe) merged.push({ ...summary, fields: [] });
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
          /*
           * A row held back by a real disagreement keeps THEIR values — but it
           * still needs its position. Every surviving row was parked on a
           * negative position a moment ago so the reorder could not collide
           * with itself, so skipping this row outright would leave it there.
           */
          await tx.sessionSlot.update({
            where: { id: r.id as string },
            data: leaveAlone.has(r.id as string) ? { position: data.position } : data,
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

  /*
   * A save that quietly merged somebody else's work, or quietly declined to
   * overwrite it, must SAY so. A value changing under you with no explanation is
   * worse than a refusal — and this sentence is what Sailavan asked for in place
   * of the old flat "nothing was written".
   */
  const notice =
    conflicts.length > 0
      ? describeConflicts(conflicts)
      : merged.length > 0
        ? `Saved. ${merged.length === 1 ? "One row" : `${merged.length} rows`} had changes from ` +
          `somebody else as well, and both were kept.`
        : undefined;

  return {
    ok: true,
    stamps: saved.map((s) => ({ id: s.id, updatedAt: s.updatedAt.toISOString() })),
    ...(merged.length > 0 ? { merged } : {}),
    ...(conflicts.length > 0 ? { conflicts } : {}),
    ...(notice ? { notice } : {}),
  };
}
