import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CONVERSATION_TURNS,
  applyTurn,
  hasUserTurn,
  isReadyToTest,
  trimConversation,
  type ConversationTurn,
  type DraftDefinition,
} from "../packages/contracts/src/conversation-turn.ts";

const tokenDraft: DraftDefinition = {
  name: "Token Risk Watcher",
  objective: "Watch this SPL token and tell me when its risk signals look dangerous.",
  targetKind: "token",
  sources: ["Token data", "Holder data"],
  rules: [{ id: "holders", metric: "largest_holder_percent", operator: "gt", value: 20 }],
  reasoningMode: "model_assisted",
  unsupportedNeeds: [],
};

test("a turn that changes nothing leaves the draft intact", () => {
  const next = applyTurn(tokenDraft, {});

  assert.deepEqual(next, tokenDraft);
});

test("omitted fields keep what was already agreed", () => {
  // The bug this prevents: an omitted targetKind falling back to a default and
  // turning an agreed token agent into a wallet agent mid-conversation.
  const next = applyTurn(tokenDraft, { name: "Renamed" });

  assert.equal(next.name, "Renamed");
  assert.equal(next.targetKind, "token");
  assert.equal(next.reasoningMode, "model_assisted");
  assert.deepEqual(next.rules, tokenDraft.rules);
});

test("changing the target discards sources and rules that belonged to the old one", () => {
  const next = applyTurn(tokenDraft, { targetKind: "endpoint" });

  assert.equal(next.targetKind, "endpoint");
  assert.deepEqual(next.sources, ["Web endpoint"], "on-chain sources cannot survive the switch");
  assert.deepEqual(next.rules, [], "token rules cannot survive the switch");
});

test("a target change may carry its own replacements", () => {
  const next = applyTurn(tokenDraft, {
    targetKind: "endpoint",
    rules: [{ id: "ok", metric: "http_status", operator: "eq", value: 200 }],
  });

  assert.equal(next.rules.length, 1);
  assert.equal(next.rules[0]?.metric, "http_status");
});

test("sources are always reconciled against the target", () => {
  const next = applyTurn(tokenDraft, { sources: ["Web endpoint"] });

  assert.deepEqual(next.sources, ["Token data", "Holder data"]);
});

test("a draft builds from nothing", () => {
  const next = applyTurn(null, { targetKind: "endpoint", objective: "Watch this status page for outages." });

  assert.equal(next.targetKind, "endpoint");
  assert.deepEqual(next.sources, ["Web endpoint"]);
});

test("readiness does not require a target address", () => {
  assert.equal(isReadyToTest(tokenDraft), true);
  assert.equal(isReadyToTest(null), false);
  assert.equal(isReadyToTest({ ...tokenDraft, objective: "too short" }), false);
});

test("a deterministic draft needs at least one rule to be ready", () => {
  const deterministic: DraftDefinition = { ...tokenDraft, reasoningMode: "rules_only", rules: [] };
  assert.equal(isReadyToTest(deterministic), false);

  assert.equal(isReadyToTest({ ...deterministic, rules: tokenDraft.rules }), true);
});

test("a reasoning draft may carry no rules at all", () => {
  assert.equal(isReadyToTest({ ...tokenDraft, rules: [] }), true);
});

test("conversation history is trimmed and blank turns dropped", () => {
  const turns: ConversationTurn[] = Array.from({ length: 25 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `turn ${index}`,
  }));
  turns.push({ role: "user", content: "   " });

  const trimmed = trimConversation(turns);
  assert.equal(trimmed.length, MAX_CONVERSATION_TURNS);
  assert.ok(trimmed.every((turn) => turn.content.trim().length > 0));
  assert.equal(hasUserTurn(trimmed), true);
  assert.equal(hasUserTurn([{ role: "assistant", content: "hello" }]), false);
});
