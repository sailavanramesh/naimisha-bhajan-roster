import { RepertoireKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { historyCutoff } from "@/lib/dates";
import { hasBeenSung, melbourneNowLocal } from "@/lib/sungCutoff";
import { LIVE_SESSION } from "./archive";

/**
 * lib/repertoireGuard.ts — the one question every "add to a list" must ask.
 *
 * It lived inside a form once, then inside one server action. Both were wrong
 * in the same way: a bhajan went onto a list from a door that had not been
 * told the rule. It lives here so every door imports the same answer —
 * app/my-list/actions.ts for members, app/admin/actions.ts for coordinators,
 * and whatever comes next.
 */

/** The three stages a bhajan can sit at on somebody's list. */
export const LEARNABLE = [
  RepertoireKind.wantToLearn,
  RepertoireKind.learning,
  RepertoireKind.known,
] as const;

export const STAGE_LABEL: Record<string, string> = {
  known: "Know it",
  learning: "Learning",
  wantToLearn: "Want to learn",
  festival: "Know it",
};


/**
 * Whether this add contradicts what the app already knows.
 *
 * THE GUARD LIVES HERE, not in a form. It was in a form, and that was the
 * whole bug: components/AddToListForm checked before adding, and the two other
 * ways in — the bhajan page and Explore, both through components/AddToList —
 * did not, so the same bhajan went onto the same list unchecked from two of
 * the three doors. A rule enforced by one caller is not a rule.
 *
 * Two contradictions:
 *
 *   ALREADY  it is on their list at some stage. Adding is not moving; the
 *            three stage buttons on the entry are how it moves.
 *   SUNG     the roster records them singing it, and this would file it under
 *            something less than "know it". Singing is evidence; a list is a
 *            statement of intent, and the evidence should win an argument it
 *            was never told about.
 *
 * Returns null when there is nothing to object to. A MOVE never reaches the
 * sung branch, because a move has an existing row and stops at the first.
 */
export async function contradiction(
  singerId: string,
  title: string,
  kind: RepertoireKind,
): Promise<
  | { already: { kind: string; label: string; title: string; preferredPitch: string | null } }
  | { sung: { title: string; times: number; lastOn: string | null; pitch: string | null } }
  | null
> {
  const bhajan = await prisma.bhajan.findFirst({
    where: { title: { equals: title, mode: "insensitive" } },
    select: { id: true, title: true },
  });
  const resolvedTitle = bhajan?.title ?? title;

  const existing = await prisma.singerRepertoire.findFirst({
    where: {
      singerId,
      kind: { in: [...LEARNABLE] },
      OR: [
        ...(bhajan ? [{ bhajanId: bhajan.id }] : []),
        { title: { equals: resolvedTitle, mode: "insensitive" as const } },
        { title: { equals: title, mode: "insensitive" as const } },
      ],
    },
    select: { kind: true, title: true, preferredPitch: true },
  });

  if (existing) {
    return {
      already: {
        kind: existing.kind,
        label: STAGE_LABEL[existing.kind] ?? existing.kind,
        title: existing.title,
        preferredPitch: existing.preferredPitch,
      },
    };
  }

  if (!bhajan || kind === RepertoireKind.known) return null;

  const rows = await prisma.sessionSlot.findMany({
    where: { singerId, bhajanId: bhajan.id, session: { ...LIVE_SESSION, date: { lte: historyCutoff() } } },
    orderBy: { session: { date: "desc" } },
    select: { confirmedPitch: true, session: { select: { date: true, startsAt: true } } },
  });

  // The date filter still admits tonight, and telling somebody they have
  // already sung this at a session that has not happened is the same lie in a
  // different window. Two hours after the start, as everywhere else.
  const nowLocal = melbourneNowLocal();
  const sung = rows.filter((s) =>
    hasBeenSung(s.session.date.toISOString().slice(0, 10), s.session.startsAt, nowLocal),
  );
  if (sung.length === 0) return null;

  return {
    sung: {
      title: resolvedTitle,
      times: sung.length,
      lastOn: sung[0]?.session.date.toISOString().slice(0, 10) ?? null,
      pitch: sung.find((x) => x.confirmedPitch)?.confirmedPitch ?? null,
    },
  };
}

