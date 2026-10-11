import { randomUUID } from 'node:crypto';
import { prisma, Prisma, type ApiEnvironment } from '@invoicetap/database';
import { logger } from '../config/logger.js';

/**
 * Transactional outbox. Work is recorded in the SAME database transaction as the state change that
 * caused it, so a crash can never leave "accepted but never queued". Workers claim rows with
 * FOR UPDATE SKIP LOCKED and re-claim rows whose lock expired (a crashed worker), so processing
 * is at-least-once; every handler is therefore written to be idempotent.
 */
export const LOCK_TIMEOUT_SECONDS = 120;
export const MAX_ATTEMPTS = 12;

export interface EnqueueInput {
  type: string;
  payload: Record<string, unknown>;
  workspaceId?: string;
  environment?: ApiEnvironment;
  runAt?: Date;
  /** Unique key: enqueueing the same dedupeKey twice is a no-op. */
  dedupeKey?: string;
}

export async function enqueue(
  tx: Prisma.TransactionClient | typeof prisma,
  input: EnqueueInput,
): Promise<void> {
  await tx.outboxEvent.createMany({
    data: [
      {
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        workspaceId: input.workspaceId,
        environment: input.environment,
        runAt: input.runAt ?? new Date(),
        dedupeKey: input.dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
}

interface ClaimedRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  workspaceId: string | null;
  environment: ApiEnvironment | null;
}

export async function claimBatch(workerId: string, limit: number, workspaceId?: string): Promise<ClaimedRow[]> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() - LOCK_TIMEOUT_SECONDS * 1000);
  const scope = workspaceId ? Prisma.sql`AND "workspaceId" = ${workspaceId}` : Prisma.empty;
  return prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "OutboxEvent"
       SET "status" = 'PROCESSING', "lockedAt" = (${now}::timestamptz AT TIME ZONE 'UTC'), "lockedBy" = ${workerId},
           "attempts" = "attempts" + 1
     WHERE "id" IN (
       SELECT "id" FROM "OutboxEvent"
        WHERE (("status" = 'PENDING' AND "runAt" <= (${now}::timestamptz AT TIME ZONE 'UTC'))
           OR ("status" = 'PROCESSING' AND "lockedAt" < (${lockExpiry}::timestamptz AT TIME ZONE 'UTC')))
           ${scope}
        ORDER BY "runAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING "id", "type", "payload", "attempts", "workspaceId", "environment"`;
}

export type JobHandler = (
  payload: Record<string, unknown>,
  job: { id: string; attempts: number; workspaceId: string | null; environment: ApiEnvironment | null },
) => Promise<void>;

/** A handler throws RetryLater to reschedule without counting as a crash. */
export class RetryLater extends Error {
  constructor(
    public readonly delayMs: number,
    message = 'retry later',
  ) {
    super(message);
  }
}

const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function backoffMs(attempt: number, baseMs = 2000, capMs = 15 * 60_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2)); // "equal jitter"
}

export async function drainOutbox(
  opts: { limit?: number; workerId?: string; maxRounds?: number; workspaceId?: string } = {},
): Promise<{ processed: number }> {
  const workerId = opts.workerId ?? `w_${randomUUID().slice(0, 8)}`;
  const limit = opts.limit ?? 25;
  let processed = 0;

  for (let round = 0; round < (opts.maxRounds ?? 20); round += 1) {
    const jobs = await claimBatch(workerId, limit, opts.workspaceId);
    if (jobs.length === 0) break;

    await Promise.all(
      jobs.map(async (job) => {
        const handler = handlers.get(job.type);
        try {
          if (!handler) throw new Error(`No handler registered for job type ${job.type}`);
          await handler(job.payload, job);
          await prisma.outboxEvent.update({
            where: { id: job.id },
            data: { status: 'DONE', doneAt: new Date(), lockedAt: null, lockedBy: null },
          });
        } catch (err) {
          const retry = err instanceof RetryLater;
          const exhausted = !retry && job.attempts >= MAX_ATTEMPTS;
          logger.warn(
            { jobId: job.id, type: job.type, attempts: job.attempts, retry },
            retry ? 'Outbox job rescheduled' : 'Outbox job failed',
          );
          await prisma.outboxEvent.update({
            where: { id: job.id },
            data: {
              status: exhausted ? 'DEAD' : 'PENDING',
              runAt: new Date(Date.now() + (retry ? err.delayMs : backoffMs(job.attempts))),
              lockedAt: null,
              lockedBy: null,
              lastError: (err instanceof Error ? err.message : 'unknown').slice(0, 300),
              // A deliberate reschedule is not a failure: do not burn an attempt on it.
              ...(retry ? { attempts: { decrement: 1 } } : {}),
            },
          });
        }
        processed += 1;
      }),
    );
  }
  return { processed };
}

/** Long-running poller for Docker/Railway/local deployments (WORKER_INLINE=true or `npm run worker`). */
export function startWorkerLoop(intervalMs = 1000): () => void {
  const workerId = `loop_${randomUUID().slice(0, 8)}`;
  let stopped = false;
  let running = false;
  const timer = setInterval(() => {
    if (stopped || running) return;
    running = true;
    drainOutbox({ workerId })
      .catch((err) => logger.error({ err }, 'Outbox drain failed'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function purgeFinishedOutbox(olderThanDays = 14): Promise<number> {
  const { count } = await prisma.outboxEvent.deleteMany({
    where: { status: 'DONE', doneAt: { lt: new Date(Date.now() - olderThanDays * 86_400_000) } },
  });
  return count;
}
