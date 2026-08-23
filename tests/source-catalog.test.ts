import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_NAMES,
  describeSource,
  isSourceAllowed,
  reconcileSources,
  selectableSources,
} from "../packages/contracts/src/source-catalog.ts";

test("each target offers only the sources it can actually read", () => {
  assert.deepEqual(selectableSources("wallet"), ["Wallet activity"]);
  assert.deepEqual(selectableSources("endpoint"), ["Web endpoint"]);
  assert.ok(selectableSources("token").includes("Holder data"));
});

test("the web source is never offered on-chain, and chain sources never on the web", () => {
  assert.equal(isSourceAllowed("Web endpoint", "token"), false);
  assert.equal(isSourceAllowed("Web endpoint", "wallet"), false);
  assert.equal(isSourceAllowed("Web endpoint", "endpoint"), true);

  assert.equal(isSourceAllowed("Token data", "endpoint"), false);
  assert.equal(isSourceAllowed("Wallet activity", "endpoint"), false);
});

test("every source has its own description", () => {
  const described = new Set(SOURCE_NAMES.map((source) => describeSource(source)));

  assert.equal(described.size, SOURCE_NAMES.length, "no two sources share a description");
  assert.equal(describeSource("Web endpoint"), "One public https URL, read with GET");
});

test("sources that do not fit the target are dropped", () => {
  const kept = reconcileSources(["Token data", "Web endpoint", "Holder data"], "token");

  assert.deepEqual(kept, ["Token data", "Holder data"]);
});

test("a target is never left with no sources", () => {
  assert.deepEqual(reconcileSources(["Web endpoint"], "token"), ["Token data", "Holder data"]);
  assert.deepEqual(reconcileSources([], "endpoint"), ["Web endpoint"]);
  assert.deepEqual(reconcileSources("nonsense", "wallet"), ["Wallet activity"]);
});

test("duplicates are collapsed", () => {
  assert.deepEqual(reconcileSources(["Token data", "Token data"], "token"), ["Token data"]);
});
