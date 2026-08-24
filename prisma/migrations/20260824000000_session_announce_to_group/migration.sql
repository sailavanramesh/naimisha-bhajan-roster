-- Whether the group-wide "the roster is up" notice goes out for a session.
--
-- NOT NULL DEFAULT TRUE. Every existing row therefore keeps behaving exactly as
-- it always has — the notice goes out — and the column is safe to add before the
-- code that reads it ships.
--
-- Only the QUIET notice is affected. The alerting "you are singing" to the
-- people rostered is sent from lib/notifySession.ts and never consults this.
ALTER TABLE "Session"
  ADD COLUMN "announceToGroup" BOOLEAN NOT NULL DEFAULT true;
