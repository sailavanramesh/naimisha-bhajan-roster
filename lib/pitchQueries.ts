/**
 * lib/pitchQueries.ts — the database side of pitch intelligence.
 *
 * Everything here returns plain rows for the pure functions in
 * lib/singerProfile.ts. Keep the maths out of this file.
 */

import { prisma } from '@/lib/db';
import { Gender } from '@prisma/client';
import type { SungRow } from '@/lib/singerProfile';
import { buildAllProfiles, buildSingerProfile, type SingerProfile } from '@/lib/singerProfile';

/** Every pitch label, ordered up the ladder. Cheap enough to fetch per request. */
export async function getPitchLabels() {
  return prisma.pitchLabel.findMany({
    orderBy: [{ step: 'asc' }, { series: 'asc' }],
    select: { label: true, step: true, series: true, note: true, semitone: true },
  });
}

export async function getPitchLabelStrings(): Promise<string[]> {
  return (await getPitchLabels()).map((p) => p.label);
}

const SUNG_SLOT_SELECT = {
  confirmedPitch: true,
  historicalRecommendedPitch: true,
  bhajanId: true,
  bhajanTitle: true,
  singer: { select: { name: true, gender: true } },
  session: { select: { date: true } },
  bhajan: {
    select: {
      raga: true,
      title: true,
      referenceGentsPitch: true,
      referenceLadiesPitch: true,
    },
  },
} as const;

type RawSlot = {
  confirmedPitch: string | null;
  historicalRecommendedPitch: string | null;
  bhajanId: string | null;
  bhajanTitle: string | null;
  /** Null on a drafted-but-unrostered slot. Such rows carry no profile signal. */
  singer: { name: string; gender: Gender | null } | null;
  session: { date: Date };
  bhajan: {
    raga: string | null;
    title: string;
    referenceGentsPitch: string | null;
    referenceLadiesPitch: string | null;
  } | null;
};

/** Drop slots with no singer — a profile is by definition per singer. */
function toSungRows(slots: RawSlot[]): SungRow[] {
  return slots.filter((s) => s.singer !== null).map(toSungRow);
}

function toSungRow(slot: RawSlot): SungRow {
  const singer = slot.singer!;
  const gender = singer.gender;
  const masterlistReference = slot.bhajan
    ? gender === Gender.Ladies
      ? slot.bhajan.referenceLadiesPitch
      : slot.bhajan.referenceGentsPitch
    : null;

  return {
    singerName: singer.name,
    gender: gender ?? null,
    confirmedPitch: slot.confirmedPitch,
    historicalRecommendedPitch: slot.historicalRecommendedPitch,
    masterlistReference,
    bhajanId: slot.bhajanId,
    bhajanTitle: slot.bhajan?.title ?? slot.bhajanTitle,
    raga: slot.bhajan?.raga ?? null,
    date: slot.session.date,
  };
}

/** Every slot with a confirmed pitch, as profile input. */
export async function getAllSungRows(): Promise<SungRow[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { confirmedPitch: { not: null } },
    select: SUNG_SLOT_SELECT,
    orderBy: { session: { date: 'desc' } },
  });
  return toSungRows(slots);
}

export async function getSungRowsForSinger(singerId: string): Promise<SungRow[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { singerId, confirmedPitch: { not: null } },
    select: SUNG_SLOT_SELECT,
    orderBy: { session: { date: 'desc' } },
  });
  return toSungRows(slots);
}

export async function getSungRowsForBhajan(bhajanId: string): Promise<SungRow[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { bhajanId, confirmedPitch: { not: null } },
    select: SUNG_SLOT_SELECT,
    orderBy: { session: { date: 'desc' } },
  });
  return toSungRows(slots);
}

/** One singer's profile, built from their whole history. */
export async function getSingerProfile(
  singerId: string,
  singerName: string,
): Promise<{ profile: SingerProfile; rows: SungRow[] }> {
  const rows = await getSungRowsForSinger(singerId);
  return { profile: buildSingerProfile(singerName, rows), rows };
}

/** Every singer's profile. Used by the fairness and comparison views. */
export async function getAllProfiles(): Promise<Map<string, SingerProfile>> {
  return buildAllProfiles(await getAllSungRows());
}
