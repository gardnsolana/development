import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_LIMITS,
  isAchievable,
  limitsFor,
} from "../packages/contracts/src/runtime-limits.ts";

test("asking for wallet win rate names what is missing and what is offered instead", () => {
  const limits = limitsFor("find me alpha wallets that have a good win rate");
  const performance = limits.find((limit) => limit.id === "wallet.performance");

  assert.ok(performance, "win rate must be recognised as underivable");
  assert.match(performance!.because, /25 most recent signatures/);
  assert.match(performance!.needs, /publishes wallet performance/);
  assert.match(performance!.instead, /watch specific wallets/i);
});

test("a screening request is recognised as needing a list endpoint", () => {
  const limits = limitsFor("find me new tokens that are pumping");
  const discovery = limits.find((limit) => limit.id === "chain.discovery");

  assert.ok(discovery);
  assert.match(discovery!.needs, /returns a list/);
  assert.match(discovery!.instead, /screen a list endpoint/i);
});

test("delivery and execution requests are caught", () => {
  assert.ok(limitsFor("dm me on telegram when it fires").some((limit) => limit.id === "delivery.external"));
  assert.ok(limitsFor("buy the token when it dips").some((limit) => limit.id === "wallet.execute"));
});

test("searching the web is distinguished from reading one endpoint", () => {
  assert.ok(limitsFor("google around for new projects").some((limit) => limit.id === "web.search"));
  assert.equal(isAchievable("read https://api.example.com/pairs and flag volume spikes"), true);
});

test("an ordinary request hits no limit at all", () => {
  assert.equal(isAchievable("alert me when this wallet drops below 1 SOL"), true);
  assert.equal(isAchievable("tell me if this token still has mint authority enabled"), true);
  assert.deepEqual(limitsFor("watch this endpoint for changes"), []);
});

test("every limit offers something achievable rather than only refusing", () => {
  for (const limit of Object.values(RUNTIME_LIMITS)) {
    assert.ok(limit.because.length > 20, `${limit.id} must explain why`);
    assert.ok(limit.needs.length > 10, `${limit.id} must name what it needs`);
    assert.ok(limit.instead.length > 20, `${limit.id} must offer an alternative`);
  }
});
