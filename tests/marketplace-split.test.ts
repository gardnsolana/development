import assert from "node:assert/strict";
import test from "node:test";

import {
  centsToBaseUnits,
  computeSettlementSplit,
  settlementMatchesSplit,
} from "../packages/contracts/src/marketplace-split.ts";

test("a round price splits cleanly into 90/10", () => {
  const split = computeSettlementSplit(10_000); // $100.00
  assert.equal(split.creatorShareCents, 9_000);
  assert.equal(split.platformFeeCents, 1_000);
});

test("the split always reconstructs the exact total", () => {
  for (const price of [1, 99, 100, 333, 1_999, 12_345, 100_000]) {
    const split = computeSettlementSplit(price);
    assert.equal(split.creatorShareCents + split.platformFeeCents, price);
  }
});

test("cents convert to USDC base units at six decimals", () => {
  assert.equal(centsToBaseUnits(1), 10_000n);
  assert.equal(centsToBaseUnits(10_000), 100_000_000n); // $100 = 100 USDC
});

test("base-unit shares mirror the cent shares", () => {
  const split = computeSettlementSplit(2_500);
  assert.equal(split.creatorShareBaseUnits, centsToBaseUnits(split.creatorShareCents));
  assert.equal(split.platformFeeBaseUnits, centsToBaseUnits(split.platformFeeCents));
  assert.equal(split.totalBaseUnits, split.creatorShareBaseUnits + split.platformFeeBaseUnits);
});

test("settlement validation requires exact matching transfers", () => {
  const split = computeSettlementSplit(5_000);
  assert.equal(settlementMatchesSplit(split, {
    buyerDeltaBaseUnits: -split.totalBaseUnits,
    creatorDeltaBaseUnits: split.creatorShareBaseUnits,
    platformDeltaBaseUnits: split.platformFeeBaseUnits,
  }), true);
  assert.equal(settlementMatchesSplit(split, {
    buyerDeltaBaseUnits: -split.totalBaseUnits,
    creatorDeltaBaseUnits: split.creatorShareBaseUnits - 1n,
    platformDeltaBaseUnits: split.platformFeeBaseUnits + 1n,
  }), false);
});

test("negative or non-integer amounts are rejected", () => {
  assert.throws(() => computeSettlementSplit(-1));
  assert.throws(() => computeSettlementSplit(1.5));
  assert.throws(() => centsToBaseUnits(-5));
});
