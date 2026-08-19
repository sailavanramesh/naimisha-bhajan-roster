-- Two things a session could not say before.
--
-- Both default to FALSE, which is exactly what every existing session already
-- does: it is on a desk, and its tabla channel carries nobody. So the backfill
-- is the current behaviour rather than merely a convenient value, and no row
-- changes meaning when this lands.
ALTER TABLE "Session"
  ADD COLUMN "noDesk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tablaMicd" BOOLEAN NOT NULL DEFAULT false;
