/**
 * The queue that runs agents when nobody is present.
 *
 * `schedule-cadence` decides when an agent is due. This is what happens next:
 * turning a due agent into exactly one unit of work, and making sure that unit
 * runs exactly once even though the thing driving it is a timer that can fire
 * twice, overlap itself, or die halfway through.
 *
 * Everything here exists because the caller is a cron trigger rather than a
 * person. A person who clicks twice notices. A timer that fires twice does not,
 * and the agent runs twice, and the run that gets stored is whichever finished
 * last. So the safety cannot come from the caller being careful — it has to be
 * in the queue.
 */

export type JobStatus =
  /** Waiting to be picked up. */
  | "queued"
  /** Claimed by a tick and currently executing. */
  | "running"
  /** Finished successfully. */
  | "succeeded"
  /** Finished unsuccessfully, and will not be tried again. */
  | "dead";

export type JobTrigger = "schedule" | "deploy" | "manual_run" | "manual_test";

export type Job = {
  id: string;
  agentId: string;
  ownerEmail: string;
  trigger: JobTrigger;
  status: JobStatus;
  /** What makes this unit of work unique. Two jobs cannot share one. */
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  /** The earliest this job may be claimed. */
  availableAt: string;
};

/**
 * The key that stops one due moment becoming two runs.
 *
 * It is built from the agent and the moment it was due — never from the current
 * time, which would differ between two ticks racing over the same due agent and
 * defeat the whole mechanism.
 */
export function scheduleKey(agentId: string, dueAt: string): string {
  return `schedule:${agentId}:${dueAt}`;
}

/** Whether two enqueue attempts describe the same unit of work. */
export function isSameWork(left: Pick<Job, "idempotencyKey">, right: Pick<Job, "idempotencyKey">): boolean {
  return left.idempotencyKey === right.idempotencyKey;
}

/**
 * Whether a job may be claimed by the tick asking.
 *
 * Claiming is the moment two overlapping ticks would collide, so the conditions
 * are deliberately narrow: it must still be queued, and it must be due. A job
 * already running belongs to another tick, and a job scheduled for later is not
 * this tick's business.
 */
export function isClaimable(job: Pick<Job, "status" | "availableAt">, now: Date): boolean {
  return job.status === "queued" && Date.parse(job.availableAt) <= now.getTime();
}

/**
 * How many jobs a single tick may take.
 *
 * An unbounded tick would drain the whole backlog in one invocation and hit the
 * platform's time limit, failing not only the jobs it was working through but
 * the ones it had not reached. A bounded tick leaves the rest for the next one,
 * which is only moments away.
 */
export const DEFAULT_TICK_LIMIT = 10;

export function claimable(jobs: readonly Job[], now: Date, limit = DEFAULT_TICK_LIMIT): Job[] {
  return jobs
    .filter((job) => isClaimable(job, now))
    // Oldest first, so a backlog drains in order rather than starving whatever
    // has been waiting longest.
    .sort((a, b) => a.availableAt.localeCompare(b.availableAt))
    .slice(0, Math.max(0, limit));
}

export type TickHealth = {
  enqueued: number;
  processed: number;
  succeeded: number;
  failed: number;
};

/**
 * Whether a tick's own numbers are internally consistent.
 *
 * A tick reports what it did, and that report is the only visibility anyone has
 * into a system that runs unobserved. A report that does not add up is worse
 * than no report, because it will be believed.
 */
export function isCoherent(health: TickHealth): boolean {
  return (
    health.enqueued >= 0 &&
    health.processed >= 0 &&
    health.succeeded >= 0 &&
    health.failed >= 0 &&
    health.succeeded + health.failed === health.processed
  );
}

/** A tick that did nothing is healthy; a tick that failed work is degraded. */
export function tickStatus(health: TickHealth): "healthy" | "degraded" {
  return health.failed > 0 ? "degraded" : "healthy";
}
