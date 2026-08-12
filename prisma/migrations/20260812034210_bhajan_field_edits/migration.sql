-- CreateTable
CREATE TABLE "BhajanFieldEdit" (
    "id" TEXT NOT NULL,
    "bhajanId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "sourceValue" TEXT,
    "editedBy" TEXT,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BhajanFieldEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BhajanFieldEdit_bhajanId_idx" ON "BhajanFieldEdit"("bhajanId");

-- CreateIndex
CREATE UNIQUE INDEX "BhajanFieldEdit_bhajanId_field_key" ON "BhajanFieldEdit"("bhajanId", "field");

-- AddForeignKey
ALTER TABLE "BhajanFieldEdit" ADD CONSTRAINT "BhajanFieldEdit_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
