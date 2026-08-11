/**
 * lib/repertoireOrder.ts — the order a singer's own bhajans are offered in.
 *
 * Pure. No Prisma import.
 *
 * Sailavan, 2026-08-12: the "songs" list "just lists the songs alphabetically
 * and they stop at a certain letter". It did — the list was sorted by how well
 * they know the bhajan and then cut at twelve, and within a band the order was
 * whatever came out of the table, which is close enough to alphabetical that
 * Ashwin's 84 songs showed as A to C and nothing else.
 *
 * Two things are wrong with that, and both are fixed here rather than by
 * raising the cut:
 *
 *   1. Alphabet is not a reason. The useful order is what they could sing
 *      TONIGHT: something they know and have not sung for a while. A bhajan
 *      sung last week is the one suggestion nobody needs.
 *   2. Twelve songs from one corner of their repertoire is not a choice.
 *      Ordering by freshness alone still clumps — a run of Ganesha bhajans
 *      learnt in the same month lands together — so the top of the list is
 *      dealt round the deities in turn.
 *
 * The result is not random. Randomising would spread the list but throw away
 * the reason for the order, and an order that changes every time you open the
 * panel is its own problem: you cannot go back to the thing you just saw.
 */

export type OrderableBhajan = {
  id: string;
  /** 0 = knows it, higher = less ready. Bands are never mixed. */
  kindRank: number;
  /**
   * Days since this singer last sang it, or null for never.
   *
   * Null sorts FIRST within its band. Something on their list they have never
   * sung here is the freshest thing they could offer — that is what a list is
   * for — and it is also the case a coordinator cannot work out from memory.
   */
  daysSinceSung: number | null;
  /** Primary deity, used only to break up clumps. Null groups together. */
  deity: string | null;
};

/**
 * A stable scramble of an id.
 *
 * The tie-break cannot be the id itself. Bhajan ids are cuids issued while the
 * masterlist was seeded in file order, so they run in roughly the same order as
 * the titles — sorting by id gave back the alphabetical list this whole module
 * exists to get away from, and the first attempt at this shipped exactly that.
 *
 * A hash spreads them while staying a pure function of the id, so the order is
 * the same every time the panel is opened. FNV-1a because it is four lines.
 */
function scatter(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Freshness first, within a band. Ties scatter, so they are stable but not alphabetical. */
function byFreshness(a: OrderableBhajan, b: OrderableBhajan): number {
  if (a.daysSinceSung === null && b.daysSinceSung !== null) return -1;
  if (b.daysSinceSung === null && a.daysSinceSung !== null) return 1;
  if (a.daysSinceSung !== null && b.daysSinceSung !== null && a.daysSinceSung !== b.daysSinceSung) {
    return b.daysSinceSung - a.daysSinceSung; // longest ago first
  }
  const ha = scatter(a.id);
  const hb = scatter(b.id);
  if (ha !== hb) return ha - hb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Deal the items round their deities, one at a time.
 *
 * Deities are visited in the order their best item appears, so the first
 * suggestion is still the single best one; it is the run behind it that gets
 * broken up.
 */
function dealByDeity<T extends OrderableBhajan>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.deity ?? "";
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const queues = [...groups.values()];
  const out: T[] = [];
  let anyLeft = true;
  let round = 0;
  while (anyLeft) {
    anyLeft = false;
    for (const queue of queues) {
      if (round < queue.length) {
        out.push(queue[round]);
        anyLeft = true;
      }
    }
    round++;
  }
  return out;
}

/**
 * Order a singer's repertoire for offering.
 *
 * Bands stay in order — everything they know comes before everything they are
 * still learning — and the dealing happens inside a band, so readiness is
 * never traded away for variety.
 */
export function balancedRepertoireOrder<T extends OrderableBhajan>(items: readonly T[]): T[] {
  const byBand = new Map<number, T[]>();
  for (const item of items) {
    const band = byBand.get(item.kindRank);
    if (band) band.push(item);
    else byBand.set(item.kindRank, [item]);
  }

  return [...byBand.keys()]
    .sort((a, b) => a - b)
    .flatMap((rank) => dealByDeity([...byBand.get(rank)!].sort(byFreshness)));
}
