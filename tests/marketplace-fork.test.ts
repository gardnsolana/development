import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DELIVERY,
  FORK_STATUS,
  isSafeToTransfer,
  purchaseDisclosure,
  retainsLogic,
  sanitiseForFork,
  type ForkableDefinition,
} from "../packages/contracts/src/marketplace-fork.ts";

const sellers: ForkableDefinition = {
  name: "Whale movement monitor",
  objective: "Alert when this wallet records new confirmed activity.",
  category: "Wallets",
  targetAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  targetKind: "wallet",
  delivery: "Telegram",
  schedule: "Every 5 minutes",
  rules: [{ metric: "new_transactions", operator: "gte", value: 1 }],
  sources: ["Wallet activity"],
  credentialId: "cred_seller_birdeye",
  origin: "claude",
};

test("the seller's target never travels with the agent", () => {
  // The failure this prevents: a buyer deploys their new agent and it silently
  // starts reading an address they never chose and were never shown.
  const fork = sanitiseForFork(sellers);

  assert.equal(fork.targetAddress, "", "it arrives pointing at nothing");
  assert.notEqual(fork.targetAddress, sellers.targetAddress);
});

test("the seller's credential and delivery do not come with it", () => {
  const fork = sanitiseForFork(sellers);

  assert.equal(fork.credentialId, null, "a key reference is not ownership of the key, and travels with neither");
  assert.equal(fork.delivery, DEFAULT_DELIVERY, "results go to the buyer's own app, not the seller's telegram");
});

test("a sanitised definition is safe to hand over", () => {
  assert.equal(isSafeToTransfer(sanitiseForFork(sellers)), true);
  assert.equal(isSafeToTransfer(sellers), false, "the original is not");

  assert.equal(
    isSafeToTransfer({ ...sanitiseForFork(sellers), credentialId: "cred_leaked" }),
    false,
    "a reattached credential fails the check",
  );
  assert.equal(
    isSafeToTransfer({ ...sanitiseForFork(sellers), targetAddress: "7xKXtg" }),
    false,
    "and so does a reattached target",
  );
});

test("a fork arrives inert", () => {
  // Not live, so nothing runs until the buyer has pointed it somewhere and
  // proved it themselves.
  assert.equal(FORK_STATUS, "draft");
});

test("stripping what is private does not strip what is useful", () => {
  // The failure on the other side: a fork so thoroughly sanitised that the
  // buyer receives an empty shell which passes every safety check and does
  // nothing.
  const fork = sanitiseForFork(sellers);

  assert.equal(retainsLogic(sellers, fork), true);
  assert.equal(fork.objective, sellers.objective, "the thinking survives");
  assert.equal(fork.rules.length, 1, "so do the rules");
  assert.deepEqual(fork.sources, sellers.sources, "and what it reads");
  assert.equal(fork.schedule, sellers.schedule, "and the cadence it was designed around");
});

test("an emptied definition is not a valid fork", () => {
  const gutted = { ...sanitiseForFork(sellers), rules: [], sources: [] };

  assert.equal(retainsLogic(sellers, gutted), false);
});

test("sanitising is deterministic, so a buyer can verify what they got", () => {
  // This is what lets a fork be checked against what was advertised. A
  // sanitiser that varied between runs would make every listing unverifiable.
  assert.deepEqual(sanitiseForFork(sellers), sanitiseForFork(sellers));
  assert.deepEqual(sanitiseForFork(sanitiseForFork(sellers)), sanitiseForFork(sellers), "and applying it twice changes nothing");
});

test("the origin is restamped rather than inherited", () => {
  // A definition that arrived through the marketplace should say so, rather
  // than continuing to claim it was authored wherever the seller made it.
  assert.equal(sanitiseForFork(sellers).origin, "marketplace");
});

test("a buyer is told what they are getting before they commit", () => {
  const notes = purchaseDisclosure(sanitiseForFork(sellers), "Birdeye");

  assert.ok(notes.some((note) => note.includes("independent copy")));
  assert.ok(notes.some((note) => note.includes("without a target")));
  assert.ok(notes.some((note) => note.includes("Birdeye")), "a paid requirement is disclosed up front");
});

test("an agent needing nothing extra does not invent a requirement", () => {
  const notes = purchaseDisclosure(sanitiseForFork(sellers), null);

  assert.ok(!notes.some((note) => note.toLowerCase().includes("key")));
});
