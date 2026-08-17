-- How many of a desk's inputs are mono before the rest pair up.
--
-- Twelve on the centre's MG20XU, which is Yamaha's own "Mono[MIC/LINE]: 12;
-- Mono/Stereo[MIC/LINE]: 4" — so only 13/14, 15/16, 17/18 and 19/20 can be a
-- stereo pair, and offering the choice on channel 1 was offering something the
-- hardware cannot do.
--
-- A property of the DESK because it is a fact about the hardware. The default
-- is right for the desk the centre owns; the next one will say for itself.
ALTER TABLE "Desk" ADD COLUMN     "monoInputs" INTEGER NOT NULL DEFAULT 12;
