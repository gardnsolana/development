import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBudget,
  carriesClock,
  declaresTruncation,
  isSafeToSend,
  isWellFormed,
  type ObservedBody,
} from "../packages/contracts/src/reasoning-input.ts";

const whole: ObservedBody = { body: "x".repeat(70_000), truncated: false };

test("a response longer than the budget is cut, and says it was cut", () => {
  // The bug this closes: a model handed the first twelve thousand characters
  // of a seventy-thousand-character feed reasons about a partial list as
  // though it were the whole one, and reports nothing unusual with complete
  // confidence.
  const presented = applyBudget(whole, 12_000);

  assert.equal(presented.body.length, 12_000);
  assert.equal(presented.truncated, true, "the model is told it is seeing part of something");
});

test("a response inside the budget is untouched and not falsely flagged", () => {
  const small: ObservedBody = { body: "a short answer", truncated: false };
  const presented = applyBudget(small, 24_000);

  assert.equal(presented.body, small.body);
  assert.equal(presented.truncated, false, "nothing was cut, so nothing is claimed");
});

test("a deeper tier sees more of the same response", () => {
  // This is what lets a deep run screen a whole list rather than its opening
  // entries — the property the tiers exist for.
  const fast = applyBudget(whole, 8_000);
  const deep = applyBudget(whole, 60_000);

  assert.ok(deep.body.length > fast.body.length);
  assert.ok(deep.body.startsWith(fast.body), "and it is the same response, seen further into");
});

test("truncation cannot be cleared by trimming again", () => {
  // A shortened view of an already shortened response is not whole again.
  const already: ObservedBody = { body: "short", truncated: true };
  const presented = applyBudget(already, 60_000);

  assert.equal(presented.body, "short", "nothing more was removed");
  assert.equal(presented.truncated, true, "but the earlier cut is still declared");
});

test("a budget of zero still declares what it did", () => {
  const presented = applyBudget(whole, 0);

  assert.equal(presented.body, "");
  assert.equal(presented.truncated, true, "showing nothing is the largest cut of all");
});

test("cutting an input without saying so is caught", () => {
  const honest = applyBudget(whole, 12_000);
  assert.equal(declaresTruncation(whole, honest), true);

  // The same trim with the flag suppressed is what makes a run worthless.
  const silent: ObservedBody = { body: honest.body, truncated: false };
  assert.equal(declaresTruncation(whole, silent), false);
});

test("an untouched input needs no declaration", () => {
  const small: ObservedBody = { body: "complete", truncated: false };

  assert.equal(declaresTruncation(small, small), true);
});

test("a secret never reaches the provider", () => {
  // Redaction happens on the way in. Stripping a key from evidence after the
  // request has already left has not stripped it from anything.
  const secret = "sk-live-abcdef123456";
  const leaking = { observation: { body: `{"key":"${secret}"}`, truncated: false }, now: new Date().toISOString() };

  assert.equal(isSafeToSend(leaking, [secret]), false);
  assert.equal(isSafeToSend({ ...leaking, observation: { body: "{}", truncated: false } }, [secret]), true);
  assert.equal(isSafeToSend({ observation: null, now: new Date().toISOString() }, [secret]), true, "nothing to leak");
});

test("a value too short to be a key does not shred the input", () => {
  // Matching a two-character "secret" would redact half of any response.
  const input = { observation: { body: "volume is up 20% today", truncated: false }, now: new Date().toISOString() };

  assert.equal(isSafeToSend(input, ["20"]), true, "a value that short is not treated as a secret");
});

test("every call carries the runtime clock", () => {
  // A model's sense of "now" is fixed at its training cutoff, so without this
  // it reads a current timestamp as the future and calls a healthy run stale.
  assert.equal(carriesClock({ observation: null, now: "2026-08-27T06:00:00.000Z" }), true);
  assert.equal(carriesClock({ observation: null, now: "" }), false);
  assert.equal(carriesClock({ observation: null, now: "some time on tuesday" }), false, "an unparseable clock is no clock");
  assert.equal(carriesClock({ observation: null, now: undefined as unknown as string }), false);
});

test("a well-formed call is clocked and carries no secret", () => {
  const secret = "sk-live-abcdef123456";
  const good = { observation: { body: "{}", truncated: false }, now: new Date().toISOString() };

  assert.equal(isWellFormed(good, [secret]), true);
  assert.equal(isWellFormed({ ...good, now: "" }, [secret]), false, "no clock, no call");
  assert.equal(
    isWellFormed({ ...good, observation: { body: secret, truncated: false } }, [secret]),
    false,
    "no leak, no call",
  );
});
