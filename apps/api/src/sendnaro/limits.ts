import { prisma } from '@invoicetap/database';
import { AppError } from '@invoicetap/shared';

/**
 * Fixed-window counters kept in Postgres so limits hold across serverless instances and restarts.
 * `consume` is a single atomic upsert; there is no read-then-write race.
 */
export async function consume(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs * 2);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, (${windowStart}::timestamptz AT TIME ZONE 'UTC'), 1, (${expiresAt}::timestamptz AT TIME ZONE 'UTC'))
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStart.getTime() + windowMs - nowMs) / 1000),
  );
  return { allowed: count <= limit, count, retryAfterSeconds };
}

export class RateLimitedError extends AppError {
  constructor(
    what: string,
    public readonly retryAfterSeconds: number,
  ) {
    super('RATE_LIMITED', `Too many ${what}. Retry in ${retryAfterSeconds}s.`);
  }
}

export async function enforce(
  key: string,
  limit: number,
  windowSeconds: number,
  what: string,
): Promise<void> {
  const r = await consume(key, limit, windowSeconds);
  if (!r.allowed) throw new RateLimitedError(what, r.retryAfterSeconds);
}

export async function purgeExpiredBuckets(): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
