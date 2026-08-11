/**
 * lib/ragaScales.ts — which notes each raga uses, as semitones above Sa.
 *
 * Pure data. Used only to decide which degrees a tabla may be tuned to
 * (lib/tabla.ts), so what matters here is WHICH NOTES ARE PRESENT, not the
 * arohana/avarohana split. Raga Desh is the example: its third is absent going
 * up and present coming down, and it is listed once as present. The tabla rule
 * prefers the fourth over the third anyway, which is what Sailavan wanted for
 * exactly that case.
 *
 * ⚠ SEEDED BY CLAUDE, NOT BY THE GROUP. Every set below is standard
 * melakarta/thaat theory as I know it, not something the centre supplied. It is
 * wrong in places and is meant to be corrected. Two things make that safe:
 *
 *   1. A raga that is absent is not guessed at — the tabla rule falls back to
 *      "assumed" and says so on screen.
 *   2. A coordinator can override any individual answer, and the override wins
 *      over anything here (TablaOverride).
 *
 * Keys are matched case-insensitively after trimming, and a dual name is split
 * on "/" so "Kalyani / Yaman" finds either half. A leading "~" in the
 * masterlist means "close to", and is stripped before matching.
 */

/** Semitones above Sa. 0 = Sa, 7 = Pa, and so on. */
export type RagaScale = readonly number[];

const S = 0, r = 1, R = 2, g = 3, G = 4, m = 5, M = 6, P = 7, d = 8, D = 9, n = 10, N = 11;

/**
 * Lower-case keys. Both halves of a dual name get their own entry so either
 * spelling resolves.
 */
export const RAGA_SCALES: Readonly<Record<string, RagaScale>> = {
  // ---- Sampoorna parents -------------------------------------------------
  shankarabharanam: [S, R, G, m, P, D, N],
  bilawal: [S, R, G, m, P, D, N],
  kalyani: [S, R, G, M, P, D, N], // sharp fourth — NO natural Ma
  yaman: [S, R, G, M, P, D, N],
  "yaman kalyan": [S, R, G, m, M, P, D, N],
  kharaharapriya: [S, R, g, m, P, D, n],
  kafi: [S, R, g, m, P, D, n],
  natabhairavi: [S, R, g, m, P, d, n],
  asavari: [S, R, g, m, P, d, n],
  mayamalavagowla: [S, r, G, m, P, d, N],
  bhairav: [S, r, G, m, P, d, N],
  hanumatodi: [S, r, g, m, P, d, n],
  bhairavi: [S, r, g, m, P, d, n],
  harikambhoji: [S, R, G, m, P, D, n],
  khamaj: [S, R, G, m, P, D, n],
  charukeshi: [S, R, G, m, P, d, n],
  keeravani: [S, R, g, m, P, d, N],
  vakulabharanam: [S, r, G, m, P, d, n],
  "basant mukhari": [S, r, G, m, P, d, n],
  sarasangi: [S, R, G, m, P, d, N],
  "nat bhairav": [S, R, G, m, P, d, N],
  "gowri manohari": [S, R, g, m, P, D, N],
  patdeep: [S, R, g, m, P, D, N],
  "shubha pantuvarali": [S, r, g, M, P, d, N],
  "miyan ki todi": [S, r, g, M, P, d, N],
  vachaspati: [S, R, G, M, P, D, n],
  "kalyana vasantham": [S, R, g, M, P, D, N],

  // ---- Pentatonic and hexatonic -----------------------------------------
  mohanam: [S, R, G, P, D], // no Ma
  bhoop: [S, R, G, P, D],
  hamsadhwani: [S, R, G, P, N], // no Ma, no Dha
  hindolam: [S, g, m, d, n], // no Re, NO Pa
  malkauns: [S, g, m, d, n],
  madhyamavati: [S, R, m, P, n],
  "madhmad sarang": [S, R, m, P, n],
  "shuddha dhanyasi": [S, g, m, P, n],
  "shuddha saveri": [S, R, m, P, D],
  durga: [S, R, m, P, D],
  abheri: [S, R, g, m, P, D, n],
  bhimpalas: [S, R, g, m, P, D, n],
  "brindavan sarang": [S, R, m, P, n],
  "brindavani sarang": [S, R, m, P, n],
  "shuddha sarang": [S, R, m, M, P, N],
  amruthavarshini: [S, G, M, P, N],
  kuntalavarali: [S, m, P, D, n],
  revagupti: [S, r, G, P, d],
  janasammohini: [S, R, G, P, D, N],
  valaji: [S, G, P, D, n],
  kalavati: [S, G, P, D, n],

  // ---- Hindustani commonly seen here -------------------------------------
  desh: [S, R, G, m, P, D, n, N],
  bageshri: [S, R, g, m, P, D, n],
  darbari: [S, R, g, m, P, d, n],
  "darbari kanada": [S, R, g, m, P, d, n],
  kanada: [S, R, g, m, P, d, n],
  jaunpuri: [S, R, g, m, P, d, n],
  bihag: [S, R, G, m, M, P, N],
  kapi: [S, R, g, m, P, D, n, N],
  tilang: [S, G, m, P, n, N],
  "miyan ki malhar": [S, R, g, m, P, D, n, N],
  pahadi: [S, R, G, m, P, D, N],
  maand: [S, R, G, m, P, D, N],
  jog: [S, G, g, m, P, n],
  tilak: [S, R, G, m, P, D, n],
  "tilak kamod": [S, R, G, m, P, D, n],
  "sindhu bhairavi": [S, r, R, g, G, m, P, d, D, n, N],
  hindolam_mishra: [S, g, m, d, n],
  "ahir bhairav": [S, r, G, m, P, D, n],
  chakravakam: [S, r, G, m, P, D, n],
  "shivaranjani": [S, R, g, P, D],
  "mishra pahadi": [S, R, G, m, P, D, N],
  gavati: [S, R, G, P, N],
  gavathi: [S, R, G, P, N],
  hindolam2: [S, g, m, d, n],
};

/** Strip the masterlist's "~ close to" marker and normalise for lookup. */
function normaliseName(raw: string): string {
  return raw.replace(/^\s*~\s*/, "").trim().toLowerCase();
}

/**
 * The notes of a raga, or null when it is not recorded here.
 *
 * Null is a real answer and must not be faked: the tabla rule reports lower
 * confidence for it rather than inventing a scale.
 *
 * A "Mishra" prefix means a light mixture of the parent raga; the parent's
 * notes are the right base, so it is stripped for lookup.
 */
export function ragaScale(raga: string | null | undefined): RagaScale | null {
  const raw = (raga ?? "").trim();
  if (!raw) return null;

  const candidates = [normaliseName(raw), ...raw.split("/").map((part) => normaliseName(part))]
    .flatMap((name) => [name, name.replace(/^mishra\s+/, "")])
    .filter(Boolean);

  for (const name of candidates) {
    const hit = RAGA_SCALES[name];
    if (hit) return hit;
  }
  return null;
}
