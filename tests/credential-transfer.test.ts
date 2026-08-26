import assert from "node:assert/strict";
import test from "node:test";

import {
  isRunnable,
  listingDisclosure,
  resolvableBy,
  transferCredentialRef,
  type AgentCredentialRef,
} from "../packages/contracts/src/credential-transfer.ts";

const seller: AgentCredentialRef = {
  credentialId: "cred_seller_123",
  requirement: { provider: "Birdeye", detail: "any paid plan" },
};

test("selling an agent keeps what it needs and drops what it had", () => {
  const bought = transferCredentialRef(seller);

  assert.equal(bought.credentialId, null, "the secret reference never travels");
  assert.deepEqual(bought.requirement, seller.requirement, "the requirement does");
});

test("a credential resolves only for the account running the agent", () => {
  const record = { id: "cred_seller_123", ownerEmail: "seller@example.com", provider: "Birdeye" };

  assert.equal(resolvableBy(record, "seller@example.com", "cred_seller_123"), true);
  assert.equal(
    resolvableBy(record, "buyer@example.com", "cred_seller_123"),
    false,
    "a buyer running a bought agent never reaches the seller's key",
  );
  assert.equal(resolvableBy(record, "seller@example.com", null), false);
  assert.equal(resolvableBy(null, "seller@example.com", "cred_seller_123"), false);
});

test("an agent needing nothing runs; one needing a key waits for its own", () => {
  assert.equal(isRunnable({ credentialId: null, requirement: null }), true);
  assert.equal(isRunnable(seller), true);
  assert.equal(isRunnable(transferCredentialRef(seller)), false, "a fresh buyer must attach their own first");
});

test("a buyer is told what a listing needs before paying", () => {
  assert.equal(listingDisclosure(seller), "Requires your own Birdeye key — any paid plan");
  assert.equal(
    listingDisclosure({ credentialId: null, requirement: { provider: "Dune" } }),
    "Requires your own Dune key",
  );
  assert.equal(listingDisclosure({ credentialId: null, requirement: null }), null);
});

test("a requirement survives being sold on again", () => {
  const twice = transferCredentialRef(transferCredentialRef(seller));

  assert.deepEqual(twice.requirement, seller.requirement);
  assert.equal(twice.credentialId, null);
});
