/**
 * When a call to a model provider is trusted, retried, or abandoned.
 *
 * `structured-output` decides whether a result that came back can be used.
 * This contract covers the step before that: whether the call should be made
 * again at all, and what may be recorded about a failure.
 *
 * The reason this needs stating rather than improvising: a reasoning call costs
 * money and holds a worker open. A retry loop against a paid provider is how
 * one bad run becomes a bill, and a call without a timeout is how one hanging
 * provider becomes a stuck queue. Both failure modes are quiet — nothing
 * crashes, the numbers just climb.
 *
 * So retrying is deliberately narrow. A request is retried only when trying
 * again could plausibly produce a different answer: the provider was busy, the
 * provider broke, or the network dropped. A request the provider rejected on
 * its merits is not retried, because the second attempt is identical to the
 * first and fails identically.
 */

/** How many times one logical call may reach the provider, first attempt included. */
export const MAX_ATTEMPTS = 2;

/** Longest a single reasoning call may hold a worker open. */
export const DEFAULT_TIMEOUT_MS = 35_000;

/**
 * Longest allowed for a conversational call.
 *
 * A turn that returns a whole agent definition needs more headroom than a call
 * returning a single decision, but it is still bounded — an unbounded call is
 * indistinguishable from a hung one.
 */
export const MAX_TIMEOUT_MS = 120_000;

/** How much provider error text may be kept. */
export const MAX_PROVIDER_MESSAGE = 300;

export type FailureKind =
  /** The provider answered with an error status. */
  | "http"
  /** The request never completed: connection dropped, timed out, DNS failed. */
  | "network"
  /** The provider answered, but the answer cannot be used. */
  | "rejected";

export type CallFailure = {
  kind: FailureKind;
  /** Present for `http` failures. */
  status?: number;
};

/**
 * Whether this failure is worth another attempt.
 *
 * Busy (429) and broken (5xx) are transient by definition, and a network
 * failure never got as far as an opinion. Everything else the provider said no
 * to — a malformed request, an unaffordable one, an unauthorised one — will be
 * said no to again in exactly the same way.
 */
export function isRetryable(failure: CallFailure): boolean {
  if (failure.kind === "network") return true;
  if (failure.kind === "rejected") return false;
  const status = failure.status ?? 0;
  return status === 429 || status >= 500;
}

/** Whether another attempt is allowed, given what happened and how many have been made. */
export function shouldRetry(failure: CallFailure, attemptsMade: number): boolean {
  return isRetryable(failure) && attemptsMade < MAX_ATTEMPTS;
}

/**
 * How long to wait before the next attempt.
 *
 * Retrying a busy provider immediately is how a rate limit becomes a longer
 * rate limit.
 */
export function retryDelayMs(attemptsMade: number): number {
  return 250 * Math.max(1, attemptsMade + 1);
}

/**
 * What may be kept from a provider's error message.
 *
 * An upstream error body can carry a request echo, a stack trace, or an
 * arbitrary amount of unrelated text — and whatever is kept here is persisted
 * to the run and shown to a person. So it is bounded, and an absent or unusable
 * message becomes a plain sentence rather than "undefined".
 */
export function safeProviderMessage(value: unknown, fallback = "The model provider could not complete this request."): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_PROVIDER_MESSAGE) : fallback;
}

/** A timeout that is always present and always bounded, whatever was requested. */
export function resolveTimeoutMs(requested: unknown): number {
  const value = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1_000, value));
}

export type ToolCallRequest = {
  model: string;
  toolName: string;
  inputSchema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
};

/**
 * The shape every reasoning call is made in.
 *
 * Two details are not optional. The schema is requested in strict mode, so the
 * provider enforces it rather than the caller hoping for it. And the tool is
 * forced rather than offered, so the model cannot answer in prose when a
 * structured result is what the runtime is going to parse.
 */
export function buildToolCall(request: ToolCallRequest) {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    tools: [{
      name: request.toolName,
      input_schema: request.inputSchema,
      strict: true,
    }],
    tool_choice: { type: "tool", name: request.toolName },
    timeoutMs: resolveTimeoutMs(request.timeoutMs),
  };
}
