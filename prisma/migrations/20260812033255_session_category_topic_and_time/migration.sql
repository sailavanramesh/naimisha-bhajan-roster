-- DropIndex
DROP INDEX "Session_date_key";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "startsAt" TEXT,
ADD COLUMN     "topic" TEXT;

-- CreateTable
CREATE TABLE "SessionCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionCategory_name_key" ON "SessionCategory"("name");

-- CreateIndex
CREATE INDEX "Session_categoryId_idx" ON "Session"("categoryId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SessionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
