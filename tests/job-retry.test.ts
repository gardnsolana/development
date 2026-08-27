import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BACKOFF_MS,
  MAX_FAILURE_MESSAGE,
  UNCLASSIFIED_CODE,
  backoffMs,
  classify,
  nextStatus,
  willRetry,
} from "../packages/contracts/src/job-retry.ts";

test("a failure we can name is terminal", () => {
  // A target that does not exist will not exist in a minute. Retrying it costs
  // a worker slot, costs money if the run reaches a model, and turns a clear
  // failure into a backlog that looks like load.
  const unreachable = { code: "ENDPOINT_UNREACHABLE", message: "The endpoint could not be reached." };
  const verdict = classify(unreachable);

  assert.equal(verdict.retryable, false);
  assert.equal(verdict.code, "ENDPOINT_UNREACHABLE", "the class survives rather than being flattened");
});

test("a limit does not lift by asking again", () => {
  assert.equal(classify({ code: "USAGE_LIMIT_REACHED", message: "Out of runs." }).retryable, false);
  assert.equal(classify({ code: "CAPABILITY_UNAVAILABLE", message: "Not supported." }).retryable, false);
});

test("a source that called its own failure temporary is believed", () => {
  // The one case where a named failure is worth another attempt: the thing that
  // failed said so itself.
  const busy = { code: "RPC_RATE_LIMITED", message: "Slow down.", transient: true };

  assert.equal(classify(busy).retryable, true);
});

test("a failure we cannot name gets one more chance", () => {
  // Not because it is likely transient — because we cannot say it isn't, and an
  // attempt is cheaper than silently dropping a run that would have worked.
  const verdict = classify(new Error("something unexpected"));

  assert.equal(verdict.retryable, true);
  assert.equal(verdict.code, UNCLASSIFIED_CODE);

  assert.equal(classify("not even an error").retryable, true);
  assert.equal(classify(null).retryable, true);
  assert.equal(classify(undefined).retryable, true);
});

test("a failure message is bounded and never empty", () => {
  // Error strings can carry a whole response body, and this is persisted to the
  // run and shown to a person.
  assert.equal(classify(new Error("x".repeat(5_000))).message.length, MAX_FAILURE_MESSAGE);
  assert.ok(classify(new Error("")).message.length > 0, "an empty error still says something");
  assert.ok(classify({ code: "X", message: "   " }).message.length > 0, "and so does a blank one");
});

test("nothing retries forever, however transient it claims to be", () => {
  const transient = { code: "RPC_RATE_LIMITED", message: "Slow down.", retryable: true };

  assert.equal(willRetry(transient, 1, 3), true);
  assert.equal(willRetry(transient, 2, 3), true);
  assert.equal(willRetry(transient, 3, 3), false, "the budget is spent");
  assert.equal(willRetry(transient, 9, 3), false);
});

test("a terminal failure never gets a second attempt, however fresh", () => {
  const terminal = { code: "ENDPOINT_UNREACHABLE", message: "gone", retryable: false };

  assert.equal(willRetry(terminal, 0, 3), false);
  assert.equal(nextStatus(terminal, 1, 3), "dead", "it stops on the first attempt");
});

test("a retryable failure waits, then dies", () => {
  const transient = { code: "RPC_RATE_LIMITED", message: "Slow down.", retryable: true };

  assert.equal(nextStatus(transient, 1, 3), "queued");
  assert.equal(nextStatus(transient, 3, 3), "dead");
});

test("backoff grows, so a struggling source is not made worse", () => {
  // Retrying immediately adds load at exactly the moment the source can least
  // take it, turning a brief outage into a sustained one.
  assert.ok(backoffMs(2) > backoffMs(1));
  assert.ok(backoffMs(3) > backoffMs(2));
  assert.ok(backoffMs(1) > 0, "there is always a pause");
});

test("backoff is capped, so a retry cannot outlive its own cadence", () => {
  // An agent on a five minute schedule gains nothing from a backoff longer than
  // its own period — the next scheduled run would arrive first.
  assert.equal(backoffMs(50), MAX_BACKOFF_MS);
  assert.ok(MAX_BACKOFF_MS <= 5 * 60_000);
});
