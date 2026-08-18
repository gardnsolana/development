import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRule } from "../packages/contracts/src/agent-definition.ts";
import {
  evaluateRule,
  evaluateRules,
  formatMetric,
  metricLabel,
} from "../packages/contracts/src/rule-evaluation.ts";

test("a numeric rule passes only when the operator holds", () => {
  const rule: AgentRule = { id: "r1", metric: "sol_balance", operator: "lt", value: 1 };
  assert.equal(evaluateRule(rule, { sol_balance: 0.4 }).passed, true);
  assert.equal(evaluateRule(rule, { sol_balance: 2 }).passed, false);
});

test("a boolean rule compares with eq and neq only", () => {
  const rule: AgentRule = { id: "r2", metric: "mint_authority_enabled", operator: "eq", value: false };
  assert.equal(evaluateRule(rule, { mint_authority_enabled: false }).passed, true);
  assert.equal(evaluateRule(rule, { mint_authority_enabled: true }).passed, false);
});

test("a missing metric is unavailable and never passes", () => {
  const rule: AgentRule = { id: "r3", metric: "new_transactions", operator: "gt", value: 0 };
  const check = evaluateRule(rule, {});
  assert.equal(check.available, false);
  assert.equal(check.passed, false);
  assert.equal(check.display, "Unavailable");
});

test("evaluateRules matches only when every available rule passes", () => {
  const rules: AgentRule[] = [
    { id: "holder", metric: "largest_holder_percent", operator: "lt", value: 10 },
    { id: "mint", metric: "mint_authority_enabled", operator: "eq", value: false },
  ];
  const pass = evaluateRules(rules, { largest_holder_percent: 4.2, mint_authority_enabled: false });
  assert.equal(pass.matched, true);
  const fail = evaluateRules(rules, { largest_holder_percent: 13.56, mint_authority_enabled: false });
  assert.equal(fail.matched, false);
});

test("no rules never counts as a deterministic match", () => {
  assert.equal(evaluateRules([], { sol_balance: 1 }).matched, false);
});

test("unavailable metrics are reported", () => {
  const rules: AgentRule[] = [{ id: "x", metric: "sol_balance", operator: "gt", value: 0 }];
  assert.deepEqual(evaluateRules(rules, {}).unavailable, ["sol_balance"]);
});

test("formatting and labels are human readable", () => {
  assert.equal(formatMetric("largest_holder_percent", 13.56), "13.56%");
  assert.equal(formatMetric("mint_authority_enabled", true), "Yes");
  assert.equal(formatMetric("sol_balance", null), "Unavailable");
  assert.equal(metricLabel("new_transactions"), "New transactions");
});
