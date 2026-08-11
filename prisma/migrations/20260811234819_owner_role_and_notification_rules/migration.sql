-- CreateEnum
CREATE TYPE "RuleScope" AS ENUM ('default', 'weekday', 'session');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'owner';

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "scope" "RuleScope" NOT NULL,
    "weekday" INTEGER,
    "sessionId" TEXT,
    "firstHour" INTEGER NOT NULL,
    "finalHour" INTEGER,
    "stopAfterHour" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationRule_sessionId_idx" ON "NotificationRule"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRule_scope_weekday_sessionId_key" ON "NotificationRule"("scope", "weekday", "sessionId");

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
