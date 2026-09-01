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
 * ONE EXCEPTION, added 2026-09-01: a COMPLETE PAIR BEATS A LONE RECORDING.
 *
 * `ProgramItem` has no karaoke column — only `Song` does — so an item's own
 * upload can never have a vocals-off half, and the toggle was simply absent on
 * every item anybody had overridden. Sailavan, seeing it on one item of three:
 * "the vocals on option is showing up for 1 of the songs but not the others,
 * even though they all have the vocals on option on the song page." The two
 * without it carried single files uploaded before the catalogue had pairs at
 * all.
 *
 * So when the item's own recording has no karaoke half AND the song has both,
 * the song's pair plays. His call, knowing it changes what the desk plays on the
 * night for those items. An item override that HAS a karaoke half still wins
 * outright, and so does one where the song has no pair to offer — nothing is
 * set aside for something that cannot do more than it can.
 *
 * `insteadOf` carries the recording that was set aside, so the screen can say
 * plainly which file it is not playing rather than quietly swapping it.
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
  /**
   * The item's own recording, when a complete song pair was preferred over it.
   * Null in every other case. The UI says which file is being set aside.
   */
  insteadOf: StoredTrack | null;
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
  const songOriginal = originalOf(song);
  const songKaraoke = karaokeOf(song);
  const songHasPair = Boolean(songOriginal && songKaraoke);

  if (own) {
    const ownKaraoke = karaokeOf(item);
    // An item that can already toggle needs nothing from the catalogue.
    if (ownKaraoke) {
      return { play: own, karaoke: ownKaraoke, source: "item", canToggle: true, insteadOf: null };
    }
    // A lone recording gives way to a complete pair, and only to a complete
    // pair — see the note at the top.
    if (songHasPair) {
      return {
        play: songOriginal,
        karaoke: songKaraoke,
        source: "song",
        canToggle: true,
        insteadOf: own,
      };
    }
    return { play: own, karaoke: null, source: "item", canToggle: false, insteadOf: null };
  }

  if (songOriginal) {
    return {
      play: songOriginal,
      karaoke: songKaraoke,
      source: "song",
      canToggle: Boolean(songKaraoke),
      insteadOf: null,
    };
  }

  return { play: null, karaoke: null, source: "none", canToggle: false, insteadOf: null };
}
