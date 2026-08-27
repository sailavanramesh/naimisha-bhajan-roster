-- Instrument.channels (how many strips) becomes Instrument.micParts (which mics).
--
-- A count could not say which head of the drum a strip was, and the two are not
-- interchangeable: a mridangam's right head is the treble one. The names go in
-- so the desk can be patched from the sheet.

ALTER TABLE "Instrument" ADD COLUMN "micParts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill as the numbers proposeChannels used to write, so no existing
-- programme's strips change their labels. Anything on one channel stays empty:
-- one mic needs no naming, and that is nearly the whole list.
UPDATE "Instrument"
SET "micParts" = ARRAY(SELECT n::text FROM generate_series(1, "channels") AS n)
WHERE "channels" > 1;

ALTER TABLE "Instrument" DROP COLUMN "channels";
