-- One audio recording per bhajan, held on the app's own disk, so a member can
-- listen and learn it.
--
-- Every column is nullable with no default, so every existing row keeps meaning
-- exactly what it did: no track. Nothing is backfilled and nothing is rewritten,
-- which is what makes this safe to apply while the app is serving.
--
-- Deliberately NOT touching `audio`, `tutorial` or `karaokeTracksForPractice`.
-- Those are URLs the masterlist arrived with, pointing at somebody else's site;
-- this is the group's own file. The two are different things and a member should
-- be able to see both.
--
-- `trackFile` is a generated file NAME, never a path — see the note on the field
-- in schema.prisma and the shape check in lib/trackStore.ts.
ALTER TABLE "Bhajan"
  ADD COLUMN "trackFile" TEXT,
  ADD COLUMN "trackName" TEXT,
  ADD COLUMN "trackBytes" INTEGER,
  ADD COLUMN "trackUploadedAt" TIMESTAMP(3),
  ADD COLUMN "trackUploadedBy" TEXT;
