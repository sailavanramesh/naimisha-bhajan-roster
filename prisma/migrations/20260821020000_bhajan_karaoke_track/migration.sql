-- The karaoke half of a practice pair: the same recording with the voice out.
--
-- Five nullable columns with no default, so every existing row keeps meaning
-- exactly what it did — one recording, no karaoke. Nothing is backfilled and
-- nothing is rewritten, which makes this safe to apply while the app is serving
-- and safe to apply BEFORE the code that reads it ships.
--
-- The track already on Bhajan becomes "the original", the one WITH vocals. That
-- needs no data change: it is what everything uploaded so far already is.
--
-- `karaokeTrackFile` is a generated file NAME, never a path — same rule and same
-- shape check as trackFile. See lib/trackStore.ts.
ALTER TABLE "Bhajan"
  ADD COLUMN "karaokeTrackFile"       TEXT,
  ADD COLUMN "karaokeTrackName"       TEXT,
  ADD COLUMN "karaokeTrackBytes"      INTEGER,
  ADD COLUMN "karaokeTrackUploadedAt" TIMESTAMP(3),
  ADD COLUMN "karaokeTrackUploadedBy" TEXT;
