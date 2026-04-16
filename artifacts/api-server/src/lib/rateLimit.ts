import { eq, sql } from "drizzle-orm";
import { db, rateLimitBucketsTable, type DbTransaction } from "@workspace/db";
import { checkRateLimitRedis, clearBucketRedis } from "./rateLimitRedis";

/**
 * Hybrid Token Bucket rate limiter — account (user) level.
 *
 * Priority:
 *   1. Redis (if REDIS_URL is set and connection is ready) — low latency, scales to millions of RPM
 *   2. PostgreSQL (fallback) — works out of the box without any extra infra
 *
 * All API keys belonging to the same user share one bucket, preventing
 * RPM multiplication by creating multiple keys.
 */
export async function checkRateLimit(userId: number, rpm: number): Promise<boolean> {
  // Try Redis first
  const redisResult = await checkRateLimitRedis(userId, rpm);
  if (redisResult !== null) {
    return redisResult;
  }

  // Fallback to PostgreSQL token bucket
  return db.transaction(async (tx: DbTransaction) => {
    const [existing] = await tx
      .select()
      .from(rateLimitBucketsTable)
      .where(eq(rateLimitBucketsTable.userId, userId))
      .limit(1)
      .for("update");

    const now = new Date();

    if (!existing) {
      // Use upsert to avoid duplicate key error when concurrent requests race on INSERT
      await tx
        .insert(rateLimitBucketsTable)
        .values({ userId, tokens: rpm - 1, lastRefillAt: now })
        .onConflictDoUpdate({
          target: rateLimitBucketsTable.userId,
          set: { tokens: sql`GREATEST(${rateLimitBucketsTable.tokens} - 1, 0)`, lastRefillAt: now },
        });
      return true;
    }

    const elapsedMinutes = (now.getTime() - existing.lastRefillAt.getTime()) / 60_000;
    const refilled = Math.min(rpm, existing.tokens + elapsedMinutes * rpm);

    if (refilled < 1) {
      await tx
        .update(rateLimitBucketsTable)
        .set({ tokens: refilled })
        .where(eq(rateLimitBucketsTable.userId, userId));
      return false;
    }

    await tx
      .update(rateLimitBucketsTable)
      .set({ tokens: refilled - 1, lastRefillAt: now })
      .where(eq(rateLimitBucketsTable.userId, userId));

    return true;
  });
}

export async function clearBucket(userId: number): Promise<void> {
  await Promise.allSettled([
    clearBucketRedis(userId),
    db.delete(rateLimitBucketsTable).where(eq(rateLimitBucketsTable.userId, userId)),
  ]);
}
