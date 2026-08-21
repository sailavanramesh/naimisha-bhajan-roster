-- A practice pair on a song: the sung recording, and the same one without the
-- voice, so the vocals can be dropped in and out while rehearsing.
--
-- Ten nullable columns, no defaults, nothing backfilled, so every existing song
-- keeps meaning exactly what it did. Safe to apply while the app is serving and
-- safe to apply BEFORE the code that reads it ships.
--
-- On Song rather than ProgramItem because practice belongs to the song, not to
-- one night's performance of it: a pair uploaded here serves every programme the
-- song appears in. ProgramItem keeps its own trackFile, which still wins for
-- that item — see lib/songTracks.ts.
ALTER TABLE "Song"
  ADD COLUMN "trackFile"              TEXT,
  ADD COLUMN "trackName"              TEXT,
  ADD COLUMN "trackBytes"             INTEGER,
  ADD COLUMN "trackUploadedAt"        TIMESTAMP(3),
  ADD COLUMN "trackUploadedBy"        TEXT,
  ADD COLUMN "karaokeTrackFile"       TEXT,
  ADD COLUMN "karaokeTrackName"       TEXT,
  ADD COLUMN "karaokeTrackBytes"      INTEGER,
  ADD COLUMN "karaokeTrackUploadedAt" TIMESTAMP(3),
  ADD COLUMN "karaokeTrackUploadedBy" TEXT;
