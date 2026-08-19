import assert from "node:assert/strict";
import test from "node:test";

import type { AgentDefinition } from "../packages/contracts/src/agent-definition.ts";
import {
  canonicalString,
  checksumMatches,
  definitionChecksum,
} from "../packages/contracts/src/definition-integrity.ts";

const definition: AgentDefinition = {
  name: "Token authority safety check",
  objective: "Match only when the largest holder is below 10% and authorities are disabled.",
  mode: "alert",
  schedule: "Hourly",
  targetKind: "token",
  targetAddress: "9pqWPKYYtmPfocSbweWfWRFqv7EKbHtZrhQjBQqMpump",
  spendLimitCents: 0,
  sources: ["Token data", "Holder data"],
  rules: [{ id: "holder", metric: "largest_holder_percent", operator: "lt", value: 10 }],
};

test("canonical serialization is key-order independent", () => {
  assert.equal(canonicalString({ b: 1, a: 2 }), canonicalString({ a: 2, b: 1 }));
});

test("checksum is stable and 64 hex chars", async () => {
  const first = await definitionChecksum(definition);
  const second = await definitionChecksum({ ...definition });
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("the private target address does not affect the checksum", async () => {
  const a = await definitionChecksum(definition);
  const b = await definitionChecksum({ ...definition, targetAddress: "FWiZ9LuyxVtkLhEVLPTF8xWyvhS36731QUpH6iN1T4mA" });
  assert.equal(a, b);
});

test("changing behaviour changes the checksum", async () => {
  const a = await definitionChecksum(definition);
  const b = await definitionChecksum({ ...definition, rules: [{ id: "holder", metric: "largest_holder_percent", operator: "lt", value: 20 }] });
  assert.notEqual(a, b);
});

test("checksumMatches verifies integrity", async () => {
  const checksum = await definitionChecksum(definition);
  assert.equal(await checksumMatches(definition, checksum), true);
  assert.equal(await checksumMatches(definition, checksum.replace(/.$/, "0")), false);
});
