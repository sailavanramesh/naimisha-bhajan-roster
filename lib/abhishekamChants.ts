import { prisma } from "@/lib/db";

/**
 * The ashtottaras, linked from an Abhishekam.
 *
 * An Abhishekam is the one session where a chant is the point: the 108 names
 * are recited over the abhishekam itself, so whoever is leading wants them on
 * the screen in front of them, not three taps away in a catalogue they have to
 * remember exists. Sailavan asked for it on the session page and on the live
 * view, which are the two screens anybody actually has open at the time.
 */

/**
 * Whether a session's kind is an Abhishekam.
 *
 * Matched on the WORD rather than on an id or an exact name, because the
 * categories are the centre's own vocabulary (see SessionCategory) and it may
 * well write "Rudra Abhishekam" or "Abhishekam & bhajans" one day. Storing an
 * id here would mean this quietly stopping the first time somebody adds a
 * second kind of abhishekam.
 */
export function isAbhishekam(categoryName: string | null | undefined): boolean {
  return (categoryName ?? "").toLowerCase().includes("abhishek");
}

export type ChantLink = { id: string; title: string };

/**
 * Every ashtottara in the chant catalogue, for the links.
 *
 * By TITLE rather than by a pinned pair of ids: the two that exist today are
 * the Shirdi Sai and the Sathya Sai, but an id list is a thing that has to be
 * edited in code the day a third is added, and nobody will remember. Anything
 * the group files as an ashtottara turns up here on its own.
 *
 * Returns [] when there are none, and the callers draw nothing for that — an
 * empty "Ashtottaras" heading on an Abhishekam is worse than silence.
 */
export async function ashtottaraLinks(): Promise<ChantLink[]> {
  return prisma.song.findMany({
    where: { kind: "chant", title: { contains: "ashtottara", mode: "insensitive" } },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}
