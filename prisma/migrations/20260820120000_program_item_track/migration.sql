-- One audio track per programme item, held on the app's own disk.
--
-- Every column is nullable with no default, so every existing row keeps
-- meaning exactly what it did: no track. Nothing is backfilled and nothing is
-- rewritten, which is what makes this safe to apply while the app is serving.
--
-- `trackFile` is a generated file NAME, never a path — see the note on the
-- field in schema.prisma and the shape check in lib/trackStore.ts.
ALTER TABLE "ProgramItem"
  ADD COLUMN "trackFile" TEXT,
  ADD COLUMN "trackName" TEXT,
  ADD COLUMN "trackBytes" INTEGER,
  ADD COLUMN "trackUploadedAt" TIMESTAMP(3),
  ADD COLUMN "trackUploadedBy" TEXT;
