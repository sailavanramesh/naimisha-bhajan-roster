-- The desk has stereo strips, an instrument may need more than one channel, and
-- whether a stereo strip is used as a pair is decided per programme.

-- The MG20XU is twelve mono strips (1-12) and four mono/stereo (13/14, 15/16,
-- 17/18, 19/20) — Yamaha's own "Mono: 12; Mono/Stereo: 4". This is the hardware
-- fact, so it belongs to the desk.
ALTER TABLE "DeskChannel" ADD COLUMN     "stereo" BOOLEAN NOT NULL DEFAULT false;

-- Whether a programme is USING such a strip as a pair depends on what is
-- plugged into it that night, so it is decided per programme. Copied from the
-- desk as the starting point.
ALTER TABLE "SessionChannel" ADD COLUMN     "stereo" BOOLEAN NOT NULL DEFAULT false;

-- A two-headed drum is miked on each head and a stereo keyboard takes a pair,
-- so an instrument says how many strips it needs. One for nearly everything,
-- which is why that is the default and no existing row changes meaning.
ALTER TABLE "Instrument" ADD COLUMN     "channels" INTEGER NOT NULL DEFAULT 1;
