import assert from "node:assert/strict";
import test from "node:test";

import {
  SEED_CATEGORIES,
  STARTER_SEEDS,
  type StarterSeed,
  plantSeed,
  validateSeedCatalog,
} from "../packages/contracts/src/seed-registry.ts";

const walletSeed = STARTER_SEEDS[0]!;

test("the live starter catalog is fully valid", () => {
  const result = validateSeedCatalog(STARTER_SEEDS);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("the expanded catalog registers ten seeds across both target kinds", () => {
  assert.equal(STARTER_SEEDS.length, 10);
  assert.ok(STARTER_SEEDS.some((seed) => seed.targetKind === "wallet"));
  assert.ok(STARTER_SEEDS.some((seed) => seed.targetKind === "token"));
});

test("every seed category is represented in the catalog", () => {
  const categories = new Set(STARTER_SEEDS.map((seed) => seed.category));

  for (const category of SEED_CATEGORIES) {
    assert.ok(categories.has(category), `${category} needs at least one seed`);
  }
});

// A first run has no stored cursor, so the runtime reports every recent
// signature as new. A starter seed that requires zero new transactions can
// therefore never match on the run a user tests it with.
test("no starter seed requires zero new transactions", () => {
  for (const seed of STARTER_SEEDS) {
    for (const rule of seed.rules) {
      if (rule.metric !== "new_transactions") continue;
      const requiresZero =
        (rule.operator === "eq" && rule.value === 0) ||
        (rule.operator === "lt" && rule.value === 1) ||
        (rule.operator === "lte" && rule.value === 0);
      assert.equal(requiresZero, false, `${seed.name} cannot match on a first run`);
    }
  }
});

test("boolean authority seeds only use equality operators", () => {
  const booleanSeeds = STARTER_SEEDS.filter((seed) =>
    seed.rules.some((rule) =>
      rule.metric === "mint_authority_enabled" || rule.metric === "freeze_authority_enabled",
    ),
  );

  assert.ok(booleanSeeds.length > 0);
  for (const seed of booleanSeeds) {
    for (const rule of seed.rules) {
      if (rule.metric !== "mint_authority_enabled" && rule.metric !== "freeze_authority_enabled") continue;
      assert.equal(typeof rule.value, "boolean", `${seed.name} must use a boolean value`);
      assert.ok(rule.operator === "eq" || rule.operator === "neq", `${seed.name} must compare with eq/neq`);
    }
  }
});

test("token supply is a token metric, not a wallet metric", () => {
  const supplySeed = STARTER_SEEDS.find((seed) => seed.id === "seed_token_supply_threshold")!;
  const onToken = plantSeed(supplySeed, "So11111111111111111111111111111111111111112");
  assert.equal(onToken.ok, true);

  const onWallet = plantSeed(
    { ...supplySeed, targetKind: "wallet" },
    "11111111111111111111111111111111",
  );
  assert.equal(onWallet.ok, false);
  if (onWallet.ok) return;
  assert.ok(onWallet.issues.some((issue) => issue.code === "unsupported_rule"));
});

test("every starter seed composes into a plantable definition", () => {
  for (const seed of STARTER_SEEDS) {
    const target = seed.targetKind === "wallet"
      ? "11111111111111111111111111111111"
      : "So11111111111111111111111111111111111111112";
    const planted = plantSeed(seed, target);

    assert.equal(planted.ok, true, `${seed.name} must plant cleanly`);
    if (!planted.ok) continue;
    assert.equal(planted.data.rules.length, seed.rules.length);
  }
});

test("planting still requires a valid target from the user", () => {
  const planted = plantSeed(walletSeed, "not-a-wallet");

  assert.equal(planted.ok, false);
  if (planted.ok) return;
  assert.ok(planted.issues.some((issue) => issue.code === "invalid_address"));
});

test("rejects a seed whose rules do not fit its target kind", () => {
  const broken: StarterSeed = {
    ...walletSeed,
    id: "seed_broken_metric",
    name: "Broken metric seed",
    targetKind: "token",
    rules: [{ id: "rule_wrong", metric: "sol_balance", operator: "gte", value: 1 }],
  };
  const result = validateSeedCatalog([broken]);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.code === "unsupported_rule"));
});

test("rejects duplicate seed ids and names", () => {
  const result = validateSeedCatalog([walletSeed, { ...walletSeed }]);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.code === "duplicate_id"));
  assert.ok(result.issues.some((issue) => issue.code === "duplicate_name"));
});

test("rejects a seed that ships without rules", () => {
  const empty: StarterSeed = {
    ...walletSeed,
    id: "seed_no_rules",
    name: "No rules seed",
    rules: [],
  };
  const result = validateSeedCatalog([empty]);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.code === "missing_rules"));
});
