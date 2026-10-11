import { createHash } from 'node:crypto';
import { prisma, Prisma, type ApiEnvironment } from '@invoicetap/database';
import { AppError } from '@invoicetap/shared';

/**
 * Idempotency-Key support, scoped by (tenant, environment, operation, key).
 *
 *  - The first request claims the key (IN_PROGRESS, short lock) in its own committed statement.
 *  - Concurrent duplicates wait for the first to finish and receive the SAME stored response.
 *  - The handler runs in a transaction and records the response in that same transaction, so the
 *    resource, its outbox events and the idempotency result commit atomically (no duplicate after a crash).
 *  - Same key + different request body  -> 409 idempotency_conflict.
 *  - Records are retained for 24 hours (RETENTION_HOURS) and then purged.
 */
export const RETENTION_HOURS = 24;
const LOCK_SECONDS = 30;
const WAIT_STEP_MS = 100;
const WAIT_MAX_MS = 15_000;

export interface IdempotentResult {
  status: number;
  body: unknown;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withIdempotency(
  scope: { workspaceId: string; environment: ApiEnvironment; operation: string },
  key: string | undefined,
  requestBody: unknown,
  handler: (tx: Prisma.TransactionClient) => Promise<IdempotentResult>,
): Promise<IdempotentResult & { replayed: boolean }> {
  if (!key) {
    const result = await prisma.$transaction((tx) => handler(tx));
    return { ...result, replayed: false };
  }
  if (key.length > 255 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new AppError('VALIDATION_ERROR', 'Idempotency-Key must be 1-255 printable ASCII characters');
  }

  const requestHash = hashRequest(requestBody);
  const where = {
    workspaceId_environment_operation_key: { ...scope, key },
  } as const;
  const now = () => new Date();
  const waitStarted = Date.now();

  for (;;) {
    const claim = await prisma.idempotencyRecord.createMany({
      data: [
        {
          ...scope,
          key,
          requestHash,
          lockedUntil: new Date(Date.now() + LOCK_SECONDS * 1000),
          expiresAt: new Date(Date.now() + RETENTION_HOURS * 3600_000),
        },
      ],
      skipDuplicates: true,
    });
    if (claim.count === 1) break; // we own the key

    const existing = await prisma.idempotencyRecord.findUnique({ where });
    if (!existing) continue; // purged between attempts: retry the claim
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'This Idempotency-Key was already used with a different request body',
      );
    }
    if (existing.state === 'COMPLETE') {
      return {
        status: existing.responseStatus ?? 200,
        body: existing.responseBody,
        replayed: true,
      };
    }
    // IN_PROGRESS. If the owner died (lock expired) take the key over atomically; otherwise wait.
    if (existing.lockedUntil <= now()) {
      const taken = await prisma.idempotencyRecord.updateMany({
        where: { id: existing.id, state: 'IN_PROGRESS', lockedUntil: existing.lockedUntil },
        data: { lockedUntil: new Date(Date.now() + LOCK_SECONDS * 1000) },
      });
      if (taken.count === 1) break;
    }
    if (Date.now() - waitStarted > WAIT_MAX_MS) {
      throw new AppError('CONFLICT', 'A request with this Idempotency-Key is still being processed');
    }
    await sleep(WAIT_STEP_MS);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const out = await handler(tx);
      await tx.idempotencyRecord.update({
        where,
        data: {
          state: 'COMPLETE',
          responseStatus: out.status,
          responseBody: out.body as Prisma.InputJsonValue,
        },
      });
      return out;
    });
    return { ...result, replayed: false };
  } catch (err) {
    // Release the claim so a legitimate retry can run (nothing was committed by the handler).
    await prisma.idempotencyRecord.delete({ where }).catch(() => undefined);
    throw err;
  }
}

export async function purgeExpiredIdempotency(): Promise<number> {
  const { count } = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
