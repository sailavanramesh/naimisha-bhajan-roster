-- Make MicCushion.colour nullable, so "cushion removed" is a real, timestamped
-- state rather than an absent row.
--
-- A deleted row carries no updatedAt, so a client could not tell "removed" from
-- "not loaded yet", and a stale poll could resurrect a cleared cushion. Keeping
-- the row with colour NULL gives every change an ordering key.
--
-- Additive and safe: the table was introduced in the previous migration and
-- holds no rows that this could invalidate.

ALTER TABLE "MicCushion" ALTER COLUMN "colour" DROP NOT NULL;
