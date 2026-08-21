/**
 * lib/songTracks.ts — which recording a programme item should play.
 *
 * Pure. No Prisma import.
 *
 * Two places can hold audio for the same piece of music and they mean different
 * things:
 *
 *   ProgramItem.trackFile   the recording chosen FOR THAT PERFORMANCE. It is
 *                           what the desk plays on the night, and somebody put
 *                           it there on purpose.
 *   Song.trackFile          the song's own recording, plus the karaoke half of
 *                           it, uploaded once and good for every programme the
 *                           song ever appears in. This is the practice pair.
 *
 * So the rule, agreed with Sailavan on 2026-08-21 when he asked for the toggle
 * on songs "and shown in the programme too": THE ITEM'S OWN TRACK WINS. A
 * deliberate choice for one night must never be silently replaced by a
 * catalogue default. Where the item has nothing, the song's pair is used, which
 * is what makes uploading once enough.
 *
 * One function, so the running order, the desk and the song page cannot drift
 * into three different answers.
 */

export type StoredTrack = {
  file: string;
  name: string | null;
  bytes: number | null;
  uploadedBy: string | null;
};

/** A song's practice pair, either half of which may be missing. */
export type PracticePair = {
  original: StoredTrack | null;
  karaoke: StoredTrack | null;
};

/** Where the audio being played came from, so the UI can say so. */
export type TrackSource = "item" | "song" | "none";

export type ResolvedTracks = {
  /** What to play. Null when there is nothing anywhere. */
  play: StoredTrack | null;
  /** The vocals-off half, ONLY when it pairs with `play`. */
  karaoke: StoredTrack | null;
  source: TrackSource;
  /** True when both halves are present, so a vocals toggle is possible. */
  canToggle: boolean;
};

type Row = {
  trackFile?: string | null;
  trackName?: string | null;
  trackBytes?: number | null;
  trackUploadedBy?: string | null;
  karaokeTrackFile?: string | null;
  karaokeTrackName?: string | null;
  karaokeTrackBytes?: number | null;
  karaokeTrackUploadedBy?: string | null;
};

/** Pull the original half out of any row that carries the five track columns. */
export function originalOf(row: Row | null | undefined): StoredTrack | null {
  if (!row?.trackFile) return null;
  return {
    file: row.trackFile,
    name: row.trackName ?? null,
    bytes: row.trackBytes ?? null,
    uploadedBy: row.trackUploadedBy ?? null,
  };
}

/** Pull the karaoke half out of any row that carries the five karaoke columns. */
export function karaokeOf(row: Row | null | undefined): StoredTrack | null {
  if (!row?.karaokeTrackFile) return null;
  return {
    file: row.karaokeTrackFile,
    name: row.karaokeTrackName ?? null,
    bytes: row.karaokeTrackBytes ?? null,
    uploadedBy: row.karaokeTrackUploadedBy ?? null,
  };
}

export function pairOf(row: Row | null | undefined): PracticePair {
  return { original: originalOf(row), karaoke: karaokeOf(row) };
}

/**
 * What one programme item should play, and whether it can toggle the vocals.
 *
 * `item` is the ProgramItem's own columns; `song` is the catalogued song's, or
 * null for an item that is not linked to one (a free-text title, a narration).
 *
 * The karaoke half only ever travels WITH the original it belongs to. Pairing an
 * item's own recording with the song's karaoke would be two different
 * recordings, which is exactly the mismatch the player warns about — so it is
 * not offered at all.
 */
export function resolveItemTracks(
  item: Row | null | undefined,
  song: Row | null | undefined,
): ResolvedTracks {
  const own = originalOf(item);
  if (own) {
    // The item's own recording. Its karaoke half, if any, is the item's too.
    const karaoke = karaokeOf(item);
    return { play: own, karaoke, source: "item", canToggle: Boolean(karaoke) };
  }

  const fromSong = originalOf(song);
  if (fromSong) {
    const karaoke = karaokeOf(song);
    return { play: fromSong, karaoke, source: "song", canToggle: Boolean(karaoke) };
  }

  return { play: null, karaoke: null, source: "none", canToggle: false };
}
