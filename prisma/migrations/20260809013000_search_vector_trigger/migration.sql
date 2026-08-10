-- Replace the GENERATED searchVector column with a trigger-maintained one.
--
-- Why: Prisma introspects a GENERATED ALWAYS column as "has a default", so
-- `prisma migrate diff` reported permanent drift and wanted to emit
--   ALTER TABLE "Bhajan" ALTER COLUMN "searchVector" DROP DEFAULT;
-- which Postgres rejects on a generated column. That left the schema
-- permanently out of sync and would have handed the next session a migration
-- that cannot be applied.
--
-- A plain column kept current by a trigger behaves identically at query time,
-- and Prisma sees it as an ordinary Unsupported("tsvector") column with no
-- default, so the schema is genuinely in sync.
--
-- searchVector is derived data. Dropping and rebuilding it loses nothing.

DROP INDEX IF EXISTS "Bhajan_searchVector_idx";
ALTER TABLE "Bhajan" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "Bhajan" ADD COLUMN "searchVector" tsvector;

-- Weighted title > glossary > meaning > lyrics.
--
-- The 'simple' configuration is deliberate: these are transliterated Sanskrit
-- titles and English stemming mangles them. 'simple' lowercases and splits,
-- which is what search over this corpus actually wants.
CREATE OR REPLACE FUNCTION bhajan_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('simple', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."glossaryTerms", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW."meaning", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW."lyrics", '')), 'D');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bhajan_search_vector_trigger ON "Bhajan";
CREATE TRIGGER bhajan_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "glossaryTerms", "meaning", "lyrics"
  ON "Bhajan"
  FOR EACH ROW
  EXECUTE FUNCTION bhajan_search_vector_update();

-- Backfill anything already present (no-op on an unseeded database).
UPDATE "Bhajan" SET "title" = "title";

CREATE INDEX "Bhajan_searchVector_idx" ON "Bhajan" USING GIN ("searchVector");
