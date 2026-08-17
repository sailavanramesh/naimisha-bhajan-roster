-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('vocal', 'instrument', 'track', 'spare');

-- CreateEnum
CREATE TYPE "DeskKind" AS ENUM ('analog', 'digital');

-- AlterTable
ALTER TABLE "ProgramItem" ADD COLUMN     "sceneNumber" INTEGER;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deskId" TEXT;

-- CreateTable
CREATE TABLE "Desk" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DeskKind" NOT NULL DEFAULT 'analog',
    "protocol" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Desk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeskChannel" (
    "id" TEXT NOT NULL,
    "deskId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "socket" INTEGER,
    "label" TEXT NOT NULL,
    "kind" "ChannelKind" NOT NULL DEFAULT 'vocal',
    "colour" "MicColour",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionChannel" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ChannelKind" NOT NULL DEFAULT 'vocal',
    "colour" "MicColour",
    "singerId" TEXT,
    "person" TEXT,
    "instrumentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramItemChannel" (
    "itemId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramItemChannel_pkey" PRIMARY KEY ("itemId","channelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Desk_name_key" ON "Desk"("name");

-- CreateIndex
CREATE INDEX "DeskChannel_deskId_idx" ON "DeskChannel"("deskId");

-- CreateIndex
CREATE UNIQUE INDEX "DeskChannel_deskId_number_key" ON "DeskChannel"("deskId", "number");

-- CreateIndex
CREATE INDEX "SessionChannel_sessionId_idx" ON "SessionChannel"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionChannel_sessionId_number_key" ON "SessionChannel"("sessionId", "number");

-- CreateIndex
CREATE INDEX "ProgramItemChannel_channelId_idx" ON "ProgramItemChannel"("channelId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "Desk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskChannel" ADD CONSTRAINT "DeskChannel_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "Desk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionChannel" ADD CONSTRAINT "SessionChannel_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionChannel" ADD CONSTRAINT "SessionChannel_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionChannel" ADD CONSTRAINT "SessionChannel_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItemChannel" ADD CONSTRAINT "ProgramItemChannel_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProgramItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItemChannel" ADD CONSTRAINT "ProgramItemChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SessionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

