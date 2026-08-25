import assert from "node:assert/strict";
import test from "node:test";

import {
  FOLLOW_LIMITS,
  clampFollowLimit,
  cleanFollowUp,
  isCoherent,
  primaryTargetFor,
  selectFollowTargets,
  summariseFollowed,
  usableFollowValue,
  type FollowUp,
} from "../packages/contracts/src/follow-plan.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const tokenFollow: FollowUp = { path: "pairs[].baseToken.address", targetKind: "token", limit: 10 };

const feed = {
  pairs: [
    { baseToken: { address: SOL } },
    { baseToken: { address: USDC } },
    { baseToken: { address: SOL } },
    { baseToken: { address: "not-an-address" } },
  ],
};

test("a fan-out deduplicates, drops what it cannot use, and keeps order", () => {
  assert.deepEqual(selectFollowTargets(feed, tokenFollow), [SOL, USDC]);
});

test("an address hidden in a response cannot reach somewhere private", () => {
  // The attack this closes: a feed returning an internal address, which the
  // agent would then fetch on the attacker's behalf.
  const hostile = {
    items: [
      { url: "https://169.254.169.254/latest/meta-data/" },
      { url: "http://127.0.0.1/admin" },
      { url: "https://user:pass@evil.example/" },
      { url: "https://api.example.com/ok" },
    ],
  };

  assert.deepEqual(
    selectFollowTargets(hostile, { path: "items[].url", targetKind: "endpoint", limit: 10 }),
    ["https://api.example.com/ok"],
  );
});

test("a followed value is validated for the kind it claims to be", () => {
  assert.equal(usableFollowValue(SOL, "token"), true);
  assert.equal(usableFollowValue("not-an-address", "token"), false);
  assert.equal(usableFollowValue("https://api.example.com/x", "endpoint"), true);
  assert.equal(usableFollowValue("http://api.example.com/x", "endpoint"), false);
  assert.equal(usableFollowValue(SOL, "endpoint"), false, "an address is not a URL");
});

test("the fan-out is capped by its own limit and by the hard ceiling", () => {
  const many = { items: Array.from({ length: 40 }, (_, index) => ({ url: `https://example.com/${index}` })) };
  const spec = { path: "items[].url", targetKind: "endpoint" as const, limit: 3 };

  assert.equal(selectFollowTargets(many, spec).length, 3);
  assert.equal(selectFollowTargets(many, { ...spec, limit: 999 }).length, FOLLOW_LIMITS.max);
});

test("a limit is clamped rather than trusted", () => {
  assert.equal(clampFollowLimit(3), 3);
  assert.equal(clampFollowLimit(0), FOLLOW_LIMITS.min);
  assert.equal(clampFollowLimit(999), FOLLOW_LIMITS.max);
  assert.equal(clampFollowLimit("nonsense"), FOLLOW_LIMITS.default);
  assert.equal(clampFollowLimit(undefined), FOLLOW_LIMITS.default);
});

test("a follow-up without a path is no follow-up at all", () => {
  assert.equal(cleanFollowUp({ path: "", targetKind: "token", limit: 5 }), null);
  assert.equal(cleanFollowUp(null), null);
  assert.equal(cleanFollowUp("nonsense"), null);
  assert.deepEqual(cleanFollowUp({ path: "a[].b", targetKind: "wallet", limit: 2 }), {
    path: "a[].b",
    targetKind: "wallet",
    limit: 2,
  });
});

test("a plan carrying a follow-up is an endpoint agent, whatever it follows", () => {
  // Getting this wrong made an agent meant to screen a feed ask for a single
  // token address instead.
  assert.equal(primaryTargetFor(tokenFollow, "token"), "endpoint");
  assert.equal(primaryTargetFor(tokenFollow, "wallet"), "endpoint");
  assert.equal(primaryTargetFor(null, "token"), "token", "a single-step agent keeps its target");
});

test("a follow-up is only coherent against an endpoint first read and a list path", () => {
  assert.equal(isCoherent(tokenFollow, "endpoint"), true);
  assert.equal(isCoherent(tokenFollow, "token"), false, "nothing to path into");
  assert.equal(isCoherent({ ...tokenFollow, path: "data.address" }, "endpoint"), false, "a path with no list is not a fan-out");
  assert.equal(isCoherent(null, "wallet"), true);
});

test("every attempted target is accounted for, including the ones that failed", () => {
  const summary = summariseFollowed([
    { value: SOL, targetKind: "token", ok: true, error: null },
    { value: USDC, targetKind: "token", ok: false, error: "RPC returned 429." },
  ]);

  assert.deepEqual(summary, { attempted: 2, succeeded: 1, failed: 1, allFailed: false });
});

test("a step where nothing came back is a broken step, not a finding", () => {
  const summary = summariseFollowed([
    { value: SOL, targetKind: "token", ok: false, error: "RPC returned 429." },
    { value: USDC, targetKind: "token", ok: false, error: "RPC returned 429." },
  ]);

  assert.equal(summary.allFailed, true);
  assert.equal(summariseFollowed([]).allFailed, false, "an agent that followed nothing is not broken");
});
