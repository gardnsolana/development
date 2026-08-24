import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TIER,
  REASONING_TIERS,
  TIER_SPECS,
  costCents,
  isReasoningTier,
  resolveTier,
  specFor,
  tierRank,
} from "../packages/contracts/src/reasoning-tiers.ts";

test("a deeper tier reads more, thinks longer and returns more evidence", () => {
  const [fast, balanced, deep] = REASONING_TIERS.map((tier) => TIER_SPECS[tier]);

  assert.ok(fast!.bodyChars < balanced!.bodyChars);
  assert.ok(balanced!.bodyChars < deep!.bodyChars);
  assert.ok(fast!.maxOutputTokens < deep!.maxOutputTokens);
  assert.ok(fast!.timeoutMs < deep!.timeoutMs);
  assert.ok(fast!.evidencePoints.max < deep!.evidencePoints.max);
});

test("only the fast tier runs on the small model", () => {
  assert.equal(TIER_SPECS.fast.modelClass, "small");
  assert.equal(TIER_SPECS.balanced.modelClass, "large");
  assert.equal(TIER_SPECS.deep.modelClass, "large");
});

test("an unknown tier resolves to the default rather than failing", () => {
  assert.equal(resolveTier("deep"), "deep");
  assert.equal(resolveTier("thorough"), DEFAULT_TIER);
  assert.equal(resolveTier(undefined), DEFAULT_TIER);
  assert.equal(resolveTier(null), DEFAULT_TIER);
  assert.equal(specFor("nonsense").label, TIER_SPECS[DEFAULT_TIER].label);
});

test("tier names are recognised exactly", () => {
  assert.equal(isReasoningTier("fast"), true);
  assert.equal(isReasoningTier("Fast"), false);
  assert.equal(isReasoningTier(2), false);
});

test("tiers are ordered by depth", () => {
  assert.ok(tierRank("fast") < tierRank("balanced"));
  assert.ok(tierRank("balanced") < tierRank("deep"));
});

const smallPricing = { inputCentsPerMillion: 100, outputCentsPerMillion: 500 };
const largePricing = { inputCentsPerMillion: 300, outputCentsPerMillion: 1500 };

test("cost comes from the tokens actually used", () => {
  const cost = costCents(smallPricing, { inputTokens: 1_000_000, outputTokens: 0 });
  assert.equal(cost, 100);

  const both = costCents(largePricing, { inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(both, 1800);
});

test("a sub-cent run is not rounded up into a whole one", () => {
  // Rounding up made a cheap tier read as identical to an expensive one.
  const cost = costCents(smallPricing, { inputTokens: 4_644, outputTokens: 592 });

  assert.ok(cost > 0, "a real run costs something");
  assert.ok(cost < 1, "and a small one costs less than a cent");
});

test("the same work costs more on the larger model", () => {
  const usage = { inputTokens: 10_000, outputTokens: 1_000 };

  assert.ok(costCents(largePricing, usage) > costCents(smallPricing, usage));
});

test("negative or empty usage never produces a negative cost", () => {
  assert.equal(costCents(largePricing, { inputTokens: 0, outputTokens: 0 }), 0);
  assert.equal(costCents(largePricing, { inputTokens: -500, outputTokens: -500 }), 0);
});
