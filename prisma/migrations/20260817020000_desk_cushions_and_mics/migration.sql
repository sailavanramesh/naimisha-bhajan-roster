-- The cushions are fixed to channels, the mics on those channels are worth
-- writing down, and a strip does not always carry the same person all evening.

-- The second per-person grant: this person runs the sound, and may keep the
-- desk and its cushion allocation right without being made an editor.
ALTER TABLE "Singer" ADD COLUMN     "canRunSound" BOOLEAN NOT NULL DEFAULT false;

-- Which mic is on the strip — "Wired", "Pegasus", "WL1", "Rode". Free text: it
-- is the sound person's shorthand for their own gear, and nothing computes on it.
ALTER TABLE "DeskChannel" ADD COLUMN     "mic" TEXT;
ALTER TABLE "SessionChannel" ADD COLUMN     "mic" TEXT;

-- Who or what is on a strip FOR ONE ITEM, when it is not the usual occupant:
-- a singer's mic used for an instrument on another song, or for one head of a
-- two-sided drum. All null in the ordinary case, where the channel's own
-- occupant stands.
ALTER TABLE "ProgramItemChannel" ADD COLUMN     "singerId" TEXT,
ADD COLUMN     "person" TEXT,
ADD COLUMN     "instrumentId" TEXT;

-- CreateIndex
CREATE INDEX "ProgramItemChannel_singerId_idx" ON "ProgramItemChannel"("singerId");

-- CreateIndex
CREATE INDEX "ProgramItemChannel_instrumentId_idx" ON "ProgramItemChannel"("instrumentId");

-- AddForeignKey
ALTER TABLE "ProgramItemChannel" ADD CONSTRAINT "ProgramItemChannel_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItemChannel" ADD CONSTRAINT "ProgramItemChannel_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
