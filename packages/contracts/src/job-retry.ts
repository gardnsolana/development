/**
 * Whether a failed run is tried again, and how long the queue waits first.
 *
 * `model-call-policy` covers retrying one call to a model provider. This is a
 * layer up: an entire agent run failed, and the queue has to decide whether
 * running it again could possibly go differently.
 *
 * Mostly it could not. A target that does not exist will not exist in a minute.
 * A workspace out of runs does not gain runs by asking again. An agent whose
 * definition is broken stays broken. Retrying those costs a worker slot, costs
 * money if the run reaches a model, and turns a clear failure into a backlog
 * that looks like load.
 *
 * So the default is inverted from what a queue usually does: a failure we can
 * name is terminal, and only a failure we cannot name is retried. Being unable
 * to classify something is the one honest reason to think it might be
 * transient.
 */

/** A failure the runtime recognised and can name. */
export type ClassifiedFailure = {
  code: string;
  message: string;
  /** Set when the source itself said the condition was temporary. */
  transient?: boolean;
};

export type FailureVerdict = {
  code: string;
  message: string;
  retryable: boolean;
};

/** Longest text kept from a failure. Error strings can carry a whole response body. */
export const MAX_FAILURE_MESSAGE = 500;

export const UNCLASSIFIED_CODE = "RUNTIME_ERROR";

/**
 * Turns whatever was thrown into a verdict the queue can act on.
 *
 * A recognised failure keeps its code and is terminal unless the source
 * explicitly reported the condition as temporary. Anything unrecognised is
 * retryable — not because it is likely transient, but because we cannot say it
 * isn't, and one more attempt is cheaper than silently dropping a run that
 * would have worked.
 */
export function classify(error: unknown): FailureVerdict {
  if (error && typeof error === "object" && "code" in error && typeof (error as ClassifiedFailure).code === "string") {
    const failure = error as ClassifiedFailure;
    return {
      code: failure.code,
      message: bound(failure.message),
      retryable: failure.transient === true,
    };
  }
  return {
    code: UNCLASSIFIED_CODE,
    message: bound(error instanceof Error ? error.message : "Runtime execution failed."),
    retryable: true,
  };
}

function bound(message: unknown): string {
  const text = typeof message === "string" ? message.trim() : "";
  return text ? text.slice(0, MAX_FAILURE_MESSAGE) : "Runtime execution failed.";
}

/** Whether this job gets another attempt, given the verdict and what it has spent. */
export function willRetry(verdict: FailureVerdict, attempts: number, maxAttempts: number): boolean {
  return verdict.retryable && attempts < maxAttempts;
}

/** Longest a retry may be held back, however many attempts have failed. */
export const MAX_BACKOFF_MS = 60_000;

/**
 * How long before the next attempt.
 *
 * Doubling, and capped. Retrying a struggling source immediately is how a brief
 * outage becomes a sustained one — the queue would be adding load at exactly
 * the moment the source can least take it. The cap exists because an agent on a
 * five minute cadence gains nothing from a backoff longer than its own period.
 */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** exponent);
}

/** Where a job lands after a failure. */
export function nextStatus(verdict: FailureVerdict, attempts: number, maxAttempts: number): "queued" | "dead" {
  return willRetry(verdict, attempts, maxAttempts) ? "queued" : "dead";
}
