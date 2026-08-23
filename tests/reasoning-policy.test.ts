import assert from "node:assert/strict";
import test from "node:test";

import {
  composeVerdict,
  shouldReason,
  unruledMetrics,
  type ModelJudgement,
} from "../packages/contracts/src/reasoning-policy.ts";

const allows: ModelJudgement = { matched: true, severity: "act_now", confidence: "high" };
const withholds: ModelJudgement = { matched: false, severity: "informational", confidence: "low" };

test("a deterministic agent matches on its rules alone", () => {
  const verdict = composeVerdict({ reasoningMode: "rules_only", hardRulesMatched: true });

  assert.equal(verdict.matched, true);
  assert.equal(verdict.reasoned, false);
});

test("the model cannot create a match the hard rules refused", () => {
  const verdict = composeVerdict({
    reasoningMode: "model_assisted",
    hardRulesMatched: false,
    judgement: allows,
  });

  assert.equal(verdict.matched, false, "a failed rule is final");
  assert.equal(verdict.withheldByModel, false);
});

test("the model can withhold a match the hard rules allowed", () => {
  const verdict = composeVerdict({
    reasoningMode: "model_assisted",
    hardRulesMatched: true,
    judgement: withholds,
  });

  assert.equal(verdict.matched, false);
  assert.equal(verdict.withheldByModel, true);
});

test("both gates open before a model-assisted agent matches", () => {
  const verdict = composeVerdict({
    reasoningMode: "model_assisted",
    hardRulesMatched: true,
    judgement: allows,
  });

  assert.equal(verdict.matched, true);
  assert.equal(verdict.reasoned, true);
  assert.equal(verdict.severity, "act_now");
});

test("reasoning is attempted on every model-assisted run, matched or not", () => {
  assert.equal(shouldReason("model_assisted"), true);
  assert.equal(shouldReason("rules_only"), false);
});

test("severity falls back rather than trusting an unknown value", () => {
  const verdict = composeVerdict({
    reasoningMode: "model_assisted",
    hardRulesMatched: true,
    judgement: { ...allows, severity: "catastrophic" as never },
  });

  assert.equal(verdict.severity, "informational");
});

test("metrics read but not ruled on are reported as context", () => {
  const observed = ["http_status", "response_time_ms", "content_length", "content_changed"] as const;
  const context = unruledMetrics(observed, ["http_status"]);

  assert.deepEqual(context, ["response_time_ms", "content_length", "content_changed"]);
  assert.deepEqual(unruledMetrics(observed, observed), []);
});
