/**
 * Keeping an unattended agent from failing quietly forever.
 *
 * Everything else in the runtime fails in front of somebody. A person pressed
 * run, a person is looking at the result, and a broken thing is obvious within
 * seconds. A scheduled agent is the one component where that is not true: it
 * fails at four in the morning, fails again five minutes later, and keeps
 * failing until someone happens to look. Nothing alerts, because from the
 * outside a broken agent and a quiet market are indistinguishable.
 *
 * Three rules cover that, and they are all about being *visible* rather than
 * being correct — a system that cannot be seen cannot be trusted no matter how
 * right it is.
 *
 * An agent that keeps failing stops itself. A job abandoned by a dead worker is
 * picked back up. And every tick writes down what it did, so silence is
 * distinguishable from health.
 */

/**
 * Consecutive failures before an agent takes itself out of the schedule.
 *
 * Low enough that a genuinely broken agent stops within the hour on most
 * cadences. High enough that a single bad response, or a source having a
 * moment, does not pause something that works.
 */
export const FAILURES_BEFORE_PAUSE = 5;

export type AgentRuntimeState = {
  status: "live" | "paused" | "draft" | "tested";
  consecutiveFailures: number;
  lastError: string | null;
};

/**
 * Whether this failure is the one that stops the agent.
 *
 * A stopped agent someone can see beats a broken one nobody can. The pause is
 * not a punishment — it is the only way the failure becomes visible, since
 * nothing else about an unattended agent draws attention.
 */
export function shouldPause(state: Pick<AgentRuntimeState, "status" | "consecutiveFailures">): boolean {
  return state.status === "live" && state.consecutiveFailures + 1 >= FAILURES_BEFORE_PAUSE;
}

/** A success clears the count. Five failures spread across a working week are not a broken agent. */
export function afterSuccess(state: AgentRuntimeState): AgentRuntimeState {
  return { ...state, consecutiveFailures: 0, lastError: null };
}

export function afterFailure(state: AgentRuntimeState, message: string): AgentRuntimeState {
  const paused = shouldPause(state);
  return {
    status: paused ? "paused" : state.status,
    consecutiveFailures: state.consecutiveFailures + 1,
    // Recorded whether or not it paused: an agent still running after four
    // failures should still be able to say what went wrong.
    lastError: message,
  };
}

/**
 * How long a job may sit claimed before it is assumed abandoned.
 *
 * A worker can be killed mid-job — a deploy, a platform eviction, a crash.
 * Nothing releases the claim in that case, so without recovery the job sits
 * "running" forever and that agent silently never runs again. This is the
 * failure that looks most like nothing being wrong.
 */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export function isStale(lockedAt: string | null, now: Date): boolean {
  if (!lockedAt) return false;
  const locked = Date.parse(lockedAt);
  if (!Number.isFinite(locked)) return true;
  return now.getTime() - locked >= STALE_AFTER_MS;
}

export type HealthRecord = {
  key: string;
  status: "healthy" | "degraded";
  checkedAt: string;
};

/**
 * Whether the scheduler has been heard from recently enough to be believed.
 *
 * A tick writes a record every time it runs, so an absent or old record means
 * the scheduler itself has stopped — which no individual agent can report,
 * because the thing that would report it is the thing that stopped.
 */
export function isSchedulerAlive(record: HealthRecord | null, now: Date, expectedIntervalMs: number): boolean {
  if (!record) return false;
  const checked = Date.parse(record.checkedAt);
  if (!Number.isFinite(checked)) return false;
  // Two intervals of grace: one missed tick is a blip, two is a pattern.
  return now.getTime() - checked <= expectedIntervalMs * 2;
}
