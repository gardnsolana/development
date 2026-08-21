import assert from "node:assert/strict";
import test from "node:test";

import {
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
