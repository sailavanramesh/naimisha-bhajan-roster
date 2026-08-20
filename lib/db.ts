import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/*
 * LOG_QUERIES=1 logs every statement, for counting them.
 *
 * "Opening the app is slow sometimes" is a claim about the number of round trips
 * a page makes, and that is not a thing you can reason about from the source: a
 * helper three files away calls another that calls the database, and the same
 * question gets asked four times over without anybody writing it twice. Turn
 * this on against the dev database, load a page, and count.
 *
 * Off by default. It is per-statement logging on the hot path.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.LOG_QUERIES === "1" ? ["query", "error", "warn"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
