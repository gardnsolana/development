import assert from "node:assert/strict";
import test from "node:test";

import {
  isSolanaAddress,
  validateAgentDefinition,
} from "../packages/contracts/src/agent-definition.ts";

const validDefinition = {
  name: "Wallet Watch",
  objective: "Alert me when this wallet receives new activity.",
  mode: "alert",
  schedule: "Every 5 minutes",
  targetKind: "wallet",
  targetAddress: "11111111111111111111111111111111",
  spendLimitCents: 0,
  sources: ["solana-rpc", "solana-rpc"],
  rules: [{ id: "activity", metric: "new_transactions", operator: "gt", value: 0 }],
};

test("accepts and normalizes a supported agent definition", () => {
  const result = validateAgentDefinition(validDefinition);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.sources, ["solana-rpc"]);
  assert.equal(result.data.rules[0]?.id, "activity");
});

test("rejects an invalid Solana target", () => {
  const result = validateAgentDefinition({ ...validDefinition, targetAddress: "not-a-wallet" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.code === "invalid_address"));
});

test("validates the decoded length of Solana public keys", () => {
  assert.equal(isSolanaAddress("11111111111111111111111111111111"), true);
  assert.equal(isSolanaAddress("So11111111111111111111111111111111111111112"), true);
  assert.equal(isSolanaAddress("111111111111111111111111111111111"), false);
  assert.equal(isSolanaAddress("O0Il-not-base58"), false);
});

test("blocks metrics that are unsupported for a token", () => {
  const result = validateAgentDefinition({
    ...validDefinition,
    targetKind: "token",
    targetAddress: "So11111111111111111111111111111111111111112",
    rules: [{ metric: "sol_balance", operator: "gte", value: 1 }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.code === "unsupported_rule"));
});

test("requires a deterministic guard for automatic execution", () => {
  const result = validateAgentDefinition({ ...validDefinition, mode: "automatic", rules: [] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.code === "missing_guard"));
});
