import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TIMEOUT_MS,
  MAX_ATTEMPTS,
  MAX_PROVIDER_MESSAGE,
  MAX_TIMEOUT_MS,
  buildToolCall,
  isRetryable,
  resolveTimeoutMs,
  retryDelayMs,
  safeProviderMessage,
  shouldRetry,
} from "../packages/contracts/src/model-call-policy.ts";

test("a busy or broken provider is worth trying again", () => {
  assert.equal(isRetryable({ kind: "http", status: 429 }), true, "rate limited now, maybe not in a moment");
  assert.equal(isRetryable({ kind: "http", status: 500 }), true);
  assert.equal(isRetryable({ kind: "http", status: 503 }), true);
  assert.equal(isRetryable({ kind: "network" }), true, "a dropped connection never got an answer");
});

test("a request the provider refused on its merits is not retried", () => {
  // The second attempt is byte-for-byte the first. It fails identically, and
  // on a paid provider it fails expensively.
  assert.equal(isRetryable({ kind: "http", status: 400 }), false, "malformed stays malformed");
  assert.equal(isRetryable({ kind: "http", status: 401 }), false, "a bad key stays bad");
  assert.equal(isRetryable({ kind: "http", status: 403 }), false);
  assert.equal(isRetryable({ kind: "http", status: 404 }), false);
  assert.equal(isRetryable({ kind: "http", status: 413 }), false, "too large stays too large");
});

test("an unusable answer is not retried either", () => {
  // A result that ran out of output tokens hits the same ceiling next time.
  assert.equal(isRetryable({ kind: "rejected" }), false);
});

test("retrying is bounded, whatever the failure", () => {
  const transient = { kind: "http", status: 503 } as const;

  assert.equal(shouldRetry(transient, 1), true, "one more attempt after the first");
  assert.equal(shouldRetry(transient, MAX_ATTEMPTS), false, "and no more than that");
  assert.ok(MAX_ATTEMPTS <= 3, "a reasoning call is not retried into a bill");

  assert.equal(shouldRetry({ kind: "http", status: 400 }, 1), false, "a terminal failure never gets the second attempt");
});

test("a retry waits, so a rate limit is not made worse", () => {
  assert.ok(retryDelayMs(1) > 0, "there is always a pause");
  assert.ok(retryDelayMs(2) > retryDelayMs(1), "and it grows");
});

test("provider error text is bounded before it is stored", () => {
  // Whatever survives here is persisted to the run and shown to a person, and
  // an upstream error body can carry a request echo or a stack trace.
  const enormous = "x".repeat(5_000);

  assert.equal(safeProviderMessage(enormous).length, MAX_PROVIDER_MESSAGE);
  assert.equal(safeProviderMessage("  rate limit exceeded  "), "rate limit exceeded", "and it is trimmed");
});

test("a missing or unusable provider message becomes a sentence, not undefined", () => {
  const fallback = "The model provider could not complete this request.";

  assert.equal(safeProviderMessage(undefined), fallback);
  assert.equal(safeProviderMessage(null), fallback);
  assert.equal(safeProviderMessage(""), fallback);
  assert.equal(safeProviderMessage("   "), fallback, "whitespace is not a message");
  assert.equal(safeProviderMessage({ message: "nested" }), fallback, "an object is not a message");
});

test("every call carries a timeout, and no call can hold a worker indefinitely", () => {
  // A call without a timeout is indistinguishable from a hung one, and it holds
  // a worker open until the platform kills it.
  assert.equal(resolveTimeoutMs(undefined), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs("90000"), DEFAULT_TIMEOUT_MS, "a non-number does not disable the timeout");
  assert.equal(resolveTimeoutMs(Number.NaN), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs(Infinity), DEFAULT_TIMEOUT_MS, "asking for no timeout gets the default, not no timeout");
  assert.equal(resolveTimeoutMs(0), 1_000, "and zero does not mean instant");
  assert.equal(resolveTimeoutMs(-5), 1_000);

  assert.equal(resolveTimeoutMs(90_000), 90_000, "a longer conversational call is still allowed");
  assert.equal(resolveTimeoutMs(600_000), MAX_TIMEOUT_MS, "but a real number is still capped");
});

test("the schema is enforced by the provider, not hoped for", () => {
  const call = buildToolCall({
    model: "test-model",
    toolName: "submit_finding",
    inputSchema: { type: "object", properties: {} },
    maxTokens: 1_400,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  assert.equal(call.tools[0]?.strict, true, "strict mode, so the shape is guaranteed rather than parsed hopefully");
});

test("the tool is forced, so the model cannot answer in prose", () => {
  // The runtime is going to parse a structured result. A model that replies
  // with a paragraph instead produces a run with nothing in it.
  const call = buildToolCall({
    model: "test-model",
    toolName: "submit_finding",
    inputSchema: { type: "object", properties: {} },
    maxTokens: 1_400,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  assert.deepEqual(call.tool_choice, { type: "tool", name: "submit_finding" });
  assert.equal(call.tools[0]?.name, "submit_finding", "and the forced tool is the one described");
});
