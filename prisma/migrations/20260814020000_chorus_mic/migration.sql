-- AlterEnum
ALTER TYPE "MicColour" ADD VALUE 'green';

-- AlterTable
ALTER TABLE "SessionSlot" ADD COLUMN     "chorusCushion" "MicColour",
ADD COLUMN     "chorusSingerId" TEXT;

-- CreateIndex
CREATE INDEX "SessionSlot_chorusSingerId_idx" ON "SessionSlot"("chorusSingerId");

-- AddForeignKey
ALTER TABLE "SessionSlot" ADD CONSTRAINT "SessionSlot_chorusSingerId_fkey" FOREIGN KEY ("chorusSingerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

