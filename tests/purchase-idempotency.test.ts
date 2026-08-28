import assert from "node:assert/strict";
import test from "node:test";

import {
  hasNoDuplicates,
  isOwnedBy,
  isSamePurchase,
  ownershipKey,
  resolvePurchase,
  type PurchaseRecord,
} from "../packages/contracts/src/purchase-idempotency.ts";

const record: PurchaseRecord = {
  id: "purchase_1",
  listingId: "listing_whale",
  buyerEmail: "buyer@gardn.test",
  forkedAgentId: "agent_market_1",
};

test("the same buyer and listing is the same purchase, however many attempts", () => {
  // The retry this survives: a button pressed twice, or a network that dropped
  // after the request arrived but before the response came back.
  assert.equal(
    isSamePurchase({ buyerEmail: "buyer@gardn.test", listingId: "listing_whale" }, { buyerEmail: "buyer@gardn.test", listingId: "listing_whale" }),
    true,
  );
});

test("identity never depends on when the attempt happened", () => {
  // A key involving the current time, a counter, or a client-supplied id would
  // differ between attempts — and so would fail at exactly the moment it is
  // needed, which is the second attempt.
  const first = ownershipKey("buyer@gardn.test", "listing_whale");
  const later = ownershipKey("buyer@gardn.test", "listing_whale");

  assert.equal(first, later);
  assert.ok(!first.includes(String(new Date().getFullYear())), "nothing about now is in it");
});

test("an address differing only in capitalisation is the same buyer", () => {
  // Otherwise the same person buys the same listing twice and is charged twice.
  assert.equal(
    isSamePurchase({ buyerEmail: "Buyer@Gardn.test", listingId: "listing_whale" }, { buyerEmail: "buyer@gardn.test", listingId: "listing_whale" }),
    true,
  );
  assert.equal(ownershipKey("  buyer@gardn.test  ", "listing_whale"), ownershipKey("buyer@gardn.test", "listing_whale"));
});

test("different buyers and different listings stay distinct", () => {
  assert.equal(
    isSamePurchase({ buyerEmail: "a@gardn.test", listingId: "listing_whale" }, { buyerEmail: "b@gardn.test", listingId: "listing_whale" }),
    false,
  );
  assert.equal(
    isSamePurchase({ buyerEmail: "a@gardn.test", listingId: "listing_whale" }, { buyerEmail: "a@gardn.test", listingId: "listing_other" }),
    false,
  );
});

test("buying something you already own returns it rather than charging again", () => {
  let created = 0;
  const outcome = resolvePurchase(record, () => {
    created += 1;
    return record;
  });

  assert.equal(created, 0, "nothing was created");
  assert.equal(outcome.created, false);
  assert.equal(outcome.record.forkedAgentId, record.forkedAgentId, "and they get what they already have");
});

test("owning it again is not an error", () => {
  // From the buyer's side this is identical to the first attempt succeeding,
  // which is exactly what they believed happened. An error would suggest
  // something went wrong when nothing did.
  const outcome = resolvePurchase(record, () => record);

  assert.equal(outcome.created, false);
  assert.equal("alreadyOwned" in outcome && outcome.alreadyOwned, true);
});

test("a first purchase does create", () => {
  let created = 0;
  const outcome = resolvePurchase(null, () => {
    created += 1;
    return record;
  });

  assert.equal(created, 1);
  assert.equal(outcome.created, true);
});

test("the ledger cannot hold two rows for one buyer and one listing", () => {
  // Two rows for the same pair means somebody was charged twice.
  assert.equal(hasNoDuplicates([record, { ...record, id: "purchase_2", listingId: "listing_other" }]), true);
  assert.equal(hasNoDuplicates([record, { ...record, id: "purchase_2" }]), false, "a second row for the same pair");
  assert.equal(
    hasNoDuplicates([record, { ...record, id: "purchase_2", buyerEmail: "BUYER@GARDN.TEST" }]),
    false,
    "including one hiding behind capitalisation",
  );
  assert.equal(hasNoDuplicates([]), true);
});

test("a derived id is never treated as proof of ownership", () => {
  // The id is derived from a listing id and an email, neither of which is
  // secret, so it is guessable by design. Ownership is checked against the
  // record rather than inferred from knowing the id.
  assert.equal(isOwnedBy(record, "buyer@gardn.test"), true);
  assert.equal(isOwnedBy(record, "BUYER@gardn.test"), true, "the same person, capitalised differently");
  assert.equal(isOwnedBy(record, "someone@else.test"), false);
});
