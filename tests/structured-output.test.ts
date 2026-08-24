import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedList,
  classifyToolResponse,
  isUsable,
} from "../packages/contracts/src/structured-output.ts";

test("a complete tool result is usable", () => {
  assert.equal(isUsable({ stopReason: "tool_use", hasToolInput: true }), true);
  assert.equal(isUsable({ stopReason: "end_turn", hasToolInput: true }), true);
});

test("a truncated result is rejected even though it parsed", () => {
  // This is the failure worth naming: the response is well-formed, but the
  // fields written last are missing and nothing errors.
  const verdict = classifyToolResponse({ stopReason: "max_tokens", hasToolInput: true });

  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.code, "truncated");
});

test("a truncated result is never retried, because the ceiling has not moved", () => {
  const verdict = classifyToolResponse({ stopReason: "max_tokens", hasToolInput: true });

  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.retryable, false, "an identical retry fails identically");
  assert.match(verdict.message, /cut off/i);
});

test("a refusal is distinguished from a truncation", () => {
  const verdict = classifyToolResponse({ stopReason: "refusal", hasToolInput: false });

  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.code, "refused");
  assert.equal(verdict.retryable, false);
});

test("a refusal is reported as such even if a block came back", () => {
  const verdict = classifyToolResponse({ stopReason: "refusal", hasToolInput: true });

  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.code, "refused", "a refusal outranks anything else present");
});

test("a missing tool block is transient and may be retried", () => {
  const verdict = classifyToolResponse({ stopReason: "end_turn", hasToolInput: false });

  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.code, "missing_tool_input");
  assert.equal(verdict.retryable, true);
});

test("list bounds are applied to the response, not declared in the schema", () => {
  // The tool-use API rejects minItems/maxItems on arrays, so a schema carrying
  // them fails every call. Bounds belong here instead.
  const clean = (item: unknown) => (typeof item === "string" && item.trim() ? item.trim() : null);

  assert.deepEqual(boundedList(["a", "b", "c", "d"], 2, clean), ["a", "b"]);
  assert.deepEqual(boundedList(["a", "  ", "b"], 10, clean), ["a", "b"]);
  assert.deepEqual(boundedList("not an array", 5, clean), []);
  assert.deepEqual(boundedList(undefined, 5, clean), []);
});

test("bounding stops counting once it is full", () => {
  let seen = 0;
  const clean = (item: unknown) => { seen += 1; return item as string; };
  boundedList(["a", "b", "c", "d", "e"], 2, clean);

  assert.equal(seen, 2, "items past the limit are never cleaned");
});
