-- Several people may be on chorus mics for one bhajan, each on their own mic
-- with its own cushion. What was a pair of columns on "SessionSlot" becomes a
-- table, and the single chorus mic each row could hold becomes its first entry.

-- CreateTable
CREATE TABLE "SessionSlotChorus" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "cushion" "MicColour",
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSlotChorus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionSlotChorus_slotId_idx" ON "SessionSlotChorus"("slotId");

-- CreateIndex
CREATE INDEX "SessionSlotChorus_singerId_idx" ON "SessionSlotChorus"("singerId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSlotChorus_slotId_singerId_key" ON "SessionSlotChorus"("slotId", "singerId");

-- AddForeignKey
ALTER TABLE "SessionSlotChorus" ADD CONSTRAINT "SessionSlotChorus_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "SessionSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSlotChorus" ADD CONSTRAINT "SessionSlotChorus_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the existing chorus mics across BEFORE the columns go, so that the drop
-- below can never be the step that loses them. Every row that named somebody
-- becomes that bhajan's first chorus mic, keeping its cushion.
INSERT INTO "SessionSlotChorus" ("id", "slotId", "singerId", "cushion", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "chorusSingerId", "chorusCushion", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SessionSlot"
WHERE "chorusSingerId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "SessionSlot" DROP CONSTRAINT "SessionSlot_chorusSingerId_fkey";

-- DropIndex
DROP INDEX "SessionSlot_chorusSingerId_idx";

-- AlterTable
ALTER TABLE "SessionSlot" DROP COLUMN "chorusCushion",
DROP COLUMN "chorusSingerId";
