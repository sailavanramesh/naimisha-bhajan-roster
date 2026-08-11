/**
 * lib/rosterQueries.ts — the database side of rostering.
 *
 * Returns plain contexts for the pure functions in lib/rosterScoring.ts.
 */

import { prisma } from '@/lib/db';
import { Gender } from '@prisma/client';
import { saOf } from '@/lib/pitch';
import { buildAllProfiles } from '@/lib/singerProfile';
import { getAllSungRows } from '@/lib/pitchQueries';
import type { SingerContext, SlotContext } from '@/lib/rosterScoring';

const DAY = 24 * 60 * 60 * 1000;

/** Window used for the load-balance term. A term, roughly. */
export const RECENT_WINDOW_DAYS = 90;

export async function getSingerContexts(sessionDate: Date): Promise<SingerContext[]> {
  const [singers, repertoire, slots, availability, sungRows] = await Promise.all([
    // Somebody with no recorded voice is not a singer and cannot be proposed:
    // the reference pitch, and therefore the whole score, is defined per voice.
    prisma.singer.findMany({ where: { gender: { not: null } }, orderBy: { name: 'asc' } }),
    prisma.singerRepertoire.findMany({
      where: { bhajanId: { not: null } },
      select: { singerId: true, bhajanId: true },
    }),
    prisma.sessionSlot.findMany({
      where: { singerId: { not: null } },
      select: { singerId: true, bhajanId: true, session: { select: { date: true } } },
    }),
    prisma.singerAvailability.findMany({ where: { date: sessionDate } }),
    getAllSungRows(),
  ]);

  const profiles = buildAllProfiles(sungRows);

  const repertoireBySinger = new Map<string, Set<string>>();
  for (const r of repertoire) {
    if (!r.bhajanId) continue;
    if (!repertoireBySinger.has(r.singerId)) repertoireBySinger.set(r.singerId, new Set());
    repertoireBySinger.get(r.singerId)!.add(r.bhajanId);
  }

  const sungBySinger = new Map<string, Set<string>>();
  const lastSang = new Map<string, Date>();
  const recentCount = new Map<string, number>();
  const lastBhajan = new Map<string, Map<string, Date>>();

  const windowStart = new Date(sessionDate.getTime() - RECENT_WINDOW_DAYS * DAY);

  for (const s of slots) {
    if (!s.singerId) continue;
    const date = s.session.date;
    // Only history BEFORE the session being planned counts.
    if (date > sessionDate) continue;

    const previous = lastSang.get(s.singerId);
    if (!previous || date > previous) lastSang.set(s.singerId, date);
    if (date >= windowStart) recentCount.set(s.singerId, (recentCount.get(s.singerId) ?? 0) + 1);

    if (s.bhajanId) {
      if (!sungBySinger.has(s.singerId)) sungBySinger.set(s.singerId, new Set());
      sungBySinger.get(s.singerId)!.add(s.bhajanId);
      if (!lastBhajan.has(s.singerId)) lastBhajan.set(s.singerId, new Map());
      const map = lastBhajan.get(s.singerId)!;
      const prev = map.get(s.bhajanId);
      if (!prev || date > prev) map.set(s.bhajanId, date);
    }
  }

  const unavailable = new Map(availability.map((a) => [a.singerId, a]));

  return singers.map((singer) => {
    const profile = profiles.get(singer.name);
    const last = lastSang.get(singer.id) ?? null;
    const bhajanDays = new Map<string, number>();
    for (const [bhajanId, date] of lastBhajan.get(singer.id) ?? []) {
      bhajanDays.set(bhajanId, Math.max(0, Math.round((sessionDate.getTime() - date.getTime()) / DAY)));
    }
    const availabilityRow = unavailable.get(singer.id);

    return {
      id: singer.id,
      name: singer.name,
      gender: (singer.gender as Gender | null) ?? null,
      repertoireBhajanIds: repertoireBySinger.get(singer.id) ?? new Set<string>(),
      sungBhajanIds: sungBySinger.get(singer.id) ?? new Set<string>(),
      daysSinceLastSang: last
        ? Math.max(0, Math.round((sessionDate.getTime() - last.getTime()) / DAY))
        : null,
      recentCount: recentCount.get(singer.id) ?? 0,
      daysSinceBhajan: bhajanDays,
      offsetMedian: profile?.overall.median ?? null,
      offsetSamples: profile?.overall.n ?? 0,
      comfortCentre: profile?.comfort?.centre ?? null,
      available: availabilityRow ? availabilityRow.available : true,
      unavailableReason: availabilityRow?.note ?? null,
    } satisfies SingerContext;
  });
}

export async function getSlotContexts(sessionId: string): Promise<SlotContext[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
    select: {
      position: true,
      singerId: true,
      bhajanId: true,
      bhajanTitle: true,
      bhajan: {
        select: { title: true, raga: true, referenceGentsPitch: true, referenceLadiesPitch: true },
      },
    },
  });

  return slots.map((s) => ({
    position: s.position,
    assignedSingerId: s.singerId,
    bhajanId: s.bhajanId,
    bhajanTitle: s.bhajan?.title ?? s.bhajanTitle,
    raga: s.bhajan?.raga ?? null,
    referenceSaGents: saOf(s.bhajan?.referenceGentsPitch),
    referenceSaLadies: saOf(s.bhajan?.referenceLadiesPitch),
  }));
}
