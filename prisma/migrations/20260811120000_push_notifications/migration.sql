-- Web push subscriptions, and a record of who has already been told about a
-- session so nobody is notified twice.
--
-- Purely additive: two tables and one enum. Nothing existing is altered, so the
-- 639 confirmed pitches and every other historical column are untouched.

CREATE TYPE "NoticeKind" AS ENUM ('rostered', 'published');

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "lastOkAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_singerId_idx" ON "PushSubscription"("singerId");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_singerId_fkey"
    FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SessionNotice" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionNotice_sessionId_singerId_kind_key"
    ON "SessionNotice"("sessionId", "singerId", "kind");
CREATE INDEX "SessionNotice_sessionId_idx" ON "SessionNotice"("sessionId");

ALTER TABLE "SessionNotice" ADD CONSTRAINT "SessionNotice_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionNotice" ADD CONSTRAINT "SessionNotice_singerId_fkey"
    FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
