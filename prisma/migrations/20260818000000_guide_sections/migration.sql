-- The wording of /guide, moved out of JSX so the owner can change it without a
-- deploy. lib/defaultGuide.ts holds the text this is seeded from, and stays the
-- fallback for an empty table and the "restore" text for a single card.

-- CreateTable
CREATE TABLE "GuideSection" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT,
    "blurb" TEXT,
    "body" TEXT NOT NULL,
    "coordinatorOnly" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideSection_key_key" ON "GuideSection"("key");

-- CreateIndex
CREATE INDEX "GuideSection_position_idx" ON "GuideSection"("position");
