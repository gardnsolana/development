import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PRICE_CENTS,
  canPublish,
  ineligibleReason,
  isValidPrice,
  normalisePrice,
  recordMatchesAgent,
  trackRecordFrom,
  type ListingDraft,
  type SourceAgent,
} from "../packages/contracts/src/listing-eligibility.ts";

const seller = { sellerEmail: "seller@gardn.test", hasVerifiedPayoutWallet: true };
const proven: SourceAgent = { ownerEmail: "seller@gardn.test", status: "live", runCount: 40, successCount: 34 };
const draft: ListingDraft = { name: "Whale movement monitor", description: "Alerts on new confirmed activity.", priceCents: 0 };

test("an agent cannot be sold on the strength of its description", () => {
  // The precondition that stops a catalogue filling with definitions nobody
  // has executed — every listing claiming something, none able to show it.
  assert.equal(ineligibleReason({ ...proven, runCount: 0, successCount: 0 }, draft, seller), "never-run");
  assert.equal(ineligibleReason({ ...proven, status: "draft" }, draft, seller), "not-deployed");
  assert.equal(canPublish(proven, draft, seller), true, "a deployed agent that has run may be listed");
});

test("publishing something you do not own is not a pricing question", () => {
  assert.equal(ineligibleReason({ ...proven, ownerEmail: "someone@else.test" }, draft, seller), "not-owner");
  assert.equal(
    ineligibleReason({ ...proven, ownerEmail: "SELLER@GARDN.TEST" }, draft, seller),
    null,
    "the same person, capitalised differently",
  );
});

test("a priced listing needs somewhere to pay the seller before it is published", () => {
  // Otherwise the listing can take money it has no way to forward.
  const priced = { ...draft, priceCents: 2_500 };

  assert.equal(ineligibleReason(proven, priced, { ...seller, hasVerifiedPayoutWallet: false }), "no-payout-wallet");
  assert.equal(ineligibleReason(proven, priced, seller), null);
  assert.equal(
    ineligibleReason(proven, draft, { ...seller, hasVerifiedPayoutWallet: false }),
    null,
    "a free listing needs no payout wallet",
  );
});

test("a listing needs a name and a description", () => {
  assert.equal(ineligibleReason(proven, { ...draft, name: "" }, seller), "missing-details");
  assert.equal(ineligibleReason(proven, { ...draft, description: "   " }, seller), "missing-details");
});

test("a price is whole cents inside a bounded range", () => {
  // Fractional cents cannot settle: the on-chain amount rounds and the split
  // stops reconciling against what the buyer agreed to.
  assert.equal(isValidPrice(2_500), true);
  assert.equal(isValidPrice(0), true, "free is a price");
  assert.equal(isValidPrice(MAX_PRICE_CENTS), true);

  assert.equal(isValidPrice(2_500.5), false, "fractional cents cannot settle");
  assert.equal(isValidPrice(-1), false);
  assert.equal(isValidPrice(MAX_PRICE_CENTS + 1), false);
  assert.equal(isValidPrice("2500"), false);
  assert.equal(isValidPrice(Number.NaN), false);
});

test("whatever a form supplies becomes a valid price", () => {
  assert.equal(normalisePrice(25), 2_500);
  assert.equal(normalisePrice(25.994), 2_599, "rounded to whole cents");
  assert.equal(normalisePrice("25"), 2_500);
  assert.equal(normalisePrice(-5), 0, "a negative price is free, not a refund");
  assert.equal(normalisePrice("nonsense"), 0);
  assert.equal(normalisePrice(999_999), MAX_PRICE_CENTS, "and it cannot exceed the cap");
});

test("a seller does not get to describe their own track record", () => {
  // A listing may say what an agent is for. It does not get to say how well it
  // has worked — those numbers are taken from the agent.
  const record = trackRecordFrom(proven);

  assert.equal(record.verifiedRuns, 40);
  assert.equal(record.successRate, 85);
});

test("an inflated record does not match the agent behind it", () => {
  assert.equal(recordMatchesAgent({ verifiedRuns: 40, successRate: 85 }, proven), true);
  assert.equal(recordMatchesAgent({ verifiedRuns: 400, successRate: 100 }, proven), false);
});

test("an agent that has never run has no success rate to claim", () => {
  // Not zero divided by zero, and not a hopeful 100%.
  const record = trackRecordFrom({ ...proven, runCount: 0, successCount: 0 });

  assert.equal(record.verifiedRuns, 0);
  assert.equal(record.successRate, 0);
  assert.ok(Number.isFinite(record.successRate));
});
