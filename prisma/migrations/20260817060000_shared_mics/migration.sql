-- A second person sharing a mic.
--
-- Two singers on one channel is a real thing — a duet taken on one mic, or a
-- pair leaning in for a chorus — and the desk has to know both names or it will
-- bring the wrong one up. Two rather than a list: that is what the hall does,
-- and a list would need a table and a screen for a case nobody has yet.
--
-- On both models, because it is asked at both levels: who usually shares this
-- mic, and who is sharing it on THIS item.
ALTER TABLE "SessionChannel" ADD COLUMN     "withSingerId" TEXT,
ADD COLUMN     "withPerson" TEXT;

ALTER TABLE "ProgramItemChannel" ADD COLUMN     "withSingerId" TEXT,
ADD COLUMN     "withPerson" TEXT;

-- CreateIndex
CREATE INDEX "SessionChannel_withSingerId_idx" ON "SessionChannel"("withSingerId");

-- CreateIndex
CREATE INDEX "ProgramItemChannel_withSingerId_idx" ON "ProgramItemChannel"("withSingerId");

-- AddForeignKey
ALTER TABLE "SessionChannel" ADD CONSTRAINT "SessionChannel_withSingerId_fkey" FOREIGN KEY ("withSingerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItemChannel" ADD CONSTRAINT "ProgramItemChannel_withSingerId_fkey" FOREIGN KEY ("withSingerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
