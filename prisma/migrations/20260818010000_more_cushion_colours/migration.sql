-- Three more cushions the centre owns: black, yellow and maroon. Offered on
-- lead mics and on the chorus alike, per Sailavan 2026-08-18.
--
-- Added, never reordered — a Postgres enum's existing labels keep their values,
-- so no MicCushion row changes meaning.

ALTER TYPE "MicColour" ADD VALUE IF NOT EXISTS 'black';
ALTER TYPE "MicColour" ADD VALUE IF NOT EXISTS 'yellow';
ALTER TYPE "MicColour" ADD VALUE IF NOT EXISTS 'maroon';
