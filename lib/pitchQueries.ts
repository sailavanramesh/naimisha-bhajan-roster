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
import { historyCutoff } from '@/lib/dates';
import { hasBeenSung, melbourneNowLocal } from '@/lib/sungCutoff';
import { LIVE_SESSION } from "./archive";

/*
 * Offsets are learned from what has been SUNG. A confirmed pitch on a session
 * that has not happened yet is a plan, not evidence — see historyCutoff.
 *
 * This is only the COARSE half of the test. It compares dates, so it still lets
 * through today's session, which at nine in the morning has not been sung. The
 * two-hour rule in lib/sungCutoff.ts finishes the job in toSungRows(), where
 * the session's own start time is available; keeping the date filter in SQL
 * means we never drag the whole future roster back to compare it.
 */
/*
 * An archived session is out of the history too.
 *
 * Not merely a view: a pitch profile computed over sessions somebody has
 * deleted would keep predicting from a night the group has decided did not
 * happen. Restoring the session brings its rows back with it.
 */
const SUNG_SESSION = () => ({ ...LIVE_SESSION, date: { lte: historyCutoff() } });

type PitchLabelRow = {
  label: string;
  step: number;
  series: string;
  note: string;
  semitone: number;
};

/*
 * The 24 pitch labels are a fixed lookup table — the shruti box has the
 * settings it has. Re-reading them cost ~350ms per request against Azure
 * Postgres, which was pure waste on a page that reads them to render a ladder.
 * Held for the life of the process; if they ever do change, a deploy restarts
 * it anyway.
 */
let pitchLabelCache: PitchLabelRow[] | null = null;
let pitchLabelInFlight: Promise<PitchLabelRow[]> | null = null;

/** Every pitch label, ordered up the ladder. */
export async function getPitchLabels(): Promise<PitchLabelRow[]> {
  if (pitchLabelCache) return pitchLabelCache;
  if (pitchLabelInFlight) return pitchLabelInFlight;

  pitchLabelInFlight = prisma.pitchLabel
    .findMany({
      orderBy: [{ step: 'asc' }, { series: 'asc' }],
      select: { label: true, step: true, series: true, note: true, semitone: true },
    })
    .then((rows) => {
      pitchLabelCache = rows;
      return rows;
    })
    .finally(() => {
      pitchLabelInFlight = null;
    });

  return pitchLabelInFlight;
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
  session: { select: { date: true, startsAt: true } },
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
  session: { date: Date; startsAt: string | null };
  bhajan: {
    raga: string | null;
    title: string;
    referenceGentsPitch: string | null;
    referenceLadiesPitch: string | null;
  } | null;
};

/**
 * Drop slots with no singer — a profile is by definition per singer — and
 * slots whose session has not been sung yet.
 *
 * The second test is the same one the known list uses: two hours after the
 * session's start. Without it, a pitch confirmed while PLANNING tonight showed
 * up this morning as "Triveni has sung this", on the strength of a row that is
 * still a plan somebody might change. One `now` for the whole set, so a page
 * cannot render a row as sung and unsung in the same breath.
 */
function toSungRows(slots: RawSlot[]): SungRow[] {
  const nowLocal = melbourneNowLocal();
  return slots
    .filter(
      (s) =>
        s.singer !== null &&
        hasBeenSung(s.session.date.toISOString().slice(0, 10), s.session.startsAt, nowLocal),
    )
    .map(toSungRow);
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
    where: { confirmedPitch: { not: null }, session: SUNG_SESSION() },
    select: SUNG_SLOT_SELECT,
    orderBy: { session: { date: 'desc' } },
  });
  return toSungRows(slots);
}

export async function getSungRowsForSinger(singerId: string): Promise<SungRow[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { singerId, confirmedPitch: { not: null }, session: SUNG_SESSION() },
    select: SUNG_SLOT_SELECT,
    orderBy: { session: { date: 'desc' } },
  });
  return toSungRows(slots);
}

export async function getSungRowsForBhajan(bhajanId: string): Promise<SungRow[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { bhajanId, confirmedPitch: { not: null }, session: SUNG_SESSION() },
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

/** A bhajan that is on a roster ahead of us, not yet sung. */
export type ScheduledRow = {
  sessionId: string;
  dateISO: string;
  startsAt: string | null;
  singerName: string | null;
  confirmedPitch: string | null;
};

/**
 * Where this bhajan is coming up.
 *
 * "Sung" is evidence and only counts once the session has actually happened —
 * `hasBeenSung`, two hours past its start. That is right, and on its own it made
 * a scheduled bhajan invisible: it was not in the history because it had not
 * happened, and nowhere else said it was about to. Sailavan, 2026-08-17: a
 * bhajan scheduled in the future "shouldn't be left out, but can't be in known
 * or sung already — should have a 'scheduled to be sung' or something
 * equivalent."
 *
 * So this is the other half of the same cutoff: everything on the far side of
 * it. A session moved forward or back crosses between the two by itself, since
 * both are computed from the date at read time rather than recorded anywhere.
 */
export async function getScheduledRowsForBhajan(bhajanId: string): Promise<ScheduledRow[]> {
  const slots = await prisma.sessionSlot.findMany({
    where: { bhajanId, session: { ...LIVE_SESSION, date: { gte: historyCutoff() }, format: 'bhajans' } },
    select: {
      confirmedPitch: true,
      singer: { select: { name: true } },
      session: { select: { id: true, date: true, startsAt: true } },
    },
    orderBy: { session: { date: 'asc' } },
  });

  const nowLocal = melbourneNowLocal();
  return slots
    .filter(
      (s) => !hasBeenSung(s.session.date.toISOString().slice(0, 10), s.session.startsAt, nowLocal),
    )
    .map((s) => ({
      sessionId: s.session.id,
      dateISO: s.session.date.toISOString().slice(0, 10),
      startsAt: s.session.startsAt,
      singerName: s.singer?.name ?? null,
      confirmedPitch: s.confirmedPitch,
    }));
}
