import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRule } from "../packages/contracts/src/agent-definition.ts";
import { evaluateRules } from "../packages/contracts/src/rule-evaluation.ts";
import { buildEvidence, type SourceStatus } from "../packages/contracts/src/run-evidence.ts";

const rules: AgentRule[] = [
  { id: "holder", metric: "largest_holder_percent", operator: "lt", value: 10 },
  { id: "mint", metric: "mint_authority_enabled", operator: "eq", value: false },
];
const sources: SourceStatus[] = [
  { source: "Token data", status: "ready", detail: "Confirmed Solana mainnet RPC." },
  { source: "Holder data", status: "ready", detail: "Confirmed Solana mainnet RPC." },
];

test("a matching run records live-readonly evidence", () => {
  const evaluation = evaluateRules(rules, { largest_holder_percent: 4.2, mint_authority_enabled: false });
  const evidence = buildEvidence({ evaluation, sourceStatuses: sources, rpcSlot: 439929328, observedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(evidence.matched, true);
  assert.equal(evidence.executionMode, "live-readonly");
  assert.equal(evidence.readySources, 2);
  assert.equal(evidence.rpcSlot, 439929328);
  assert.match(evidence.summary, /All 2 rules matched/);
});

test("a failing run summarizes the misses", () => {
  const evaluation = evaluateRules(rules, { largest_holder_percent: 13.56, mint_authority_enabled: false });
  const evidence = buildEvidence({ evaluation, sourceStatuses: sources, rpcSlot: 1, observedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(evidence.matched, false);
  assert.match(evidence.summary, /1 of 2 rules did not match/);
});

test("unavailable data is reported, not matched", () => {
  const evaluation = evaluateRules(rules, { mint_authority_enabled: false });
  const evidence = buildEvidence({ evaluation, sourceStatuses: sources, rpcSlot: null, observedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(evidence.matched, false);
  assert.deepEqual(evidence.unavailable, ["largest_holder_percent"]);
  assert.match(evidence.summary, /unavailable/i);
});

test("no rules never counts as a match", () => {
  const evidence = buildEvidence({ evaluation: evaluateRules([], {}), sourceStatuses: [], rpcSlot: 1, observedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(evidence.matched, false);
  assert.match(evidence.summary, /No deterministic rules/);
});

test("invalid slot or timestamp is rejected", () => {
  const evaluation = evaluateRules(rules, { largest_holder_percent: 1, mint_authority_enabled: false });
  assert.throws(() => buildEvidence({ evaluation, sourceStatuses: sources, rpcSlot: -1, observedAt: "2026-01-01T00:00:00.000Z" }));
  assert.throws(() => buildEvidence({ evaluation, sourceStatuses: sources, rpcSlot: 1, observedAt: "nope" }));
});
