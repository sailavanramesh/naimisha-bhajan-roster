-- Whose clock `startsAt` is on.
--
-- NOT NULL with a default, which is also the backfill: Postgres writes
-- 'Australia/Melbourne' into every existing row as part of this statement.
-- That is the honest value for all of them — every session the centre has held
-- so far was in Melbourne — and it means no session is ever left with a time
-- that cannot be converted.
ALTER TABLE "Session"
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Australia/Melbourne';
