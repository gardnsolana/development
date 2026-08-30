import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORED_FIELDS,
  DERIVED_FIELDS,
  PUBLISHED_FIELDS,
  WITHHELD_FIELDS,
  buildCard,
  cardIsHonest,
  hasNoOverlap,
  isAuthoredBySeller,
  isDerived,
  isExhaustive,
  sellerDisclosure,
  unclassifiedFields,
} from "../packages/contracts/src/listing-disclosure.ts";

test("the review screen is a partition, not a hand-written list", () => {
  // The quiet failure this prevents: a field added to the definition months
  // from now that nobody remembers to classify, shipping to buyers because the
  // disclosure was prose rather than a partition.
  const definitionFields = [...PUBLISHED_FIELDS, ...WITHHELD_FIELDS];

  assert.equal(isExhaustive(definitionFields), true);
  assert.equal(hasNoOverlap(), true, "nothing is both published and withheld");
});

test("an unclassified field fails rather than being assumed safe", () => {
  const withNewField = [...PUBLISHED_FIELDS, ...WITHHELD_FIELDS, "sellerNotes"];

  assert.equal(isExhaustive(withNewField), false);
  assert.deepEqual(unclassifiedFields(withNewField), ["sellerNotes"], "and it names what needs deciding");
});

test("the things that must never leave are withheld", () => {
  const removed = new Set<string>(WITHHELD_FIELDS);

  assert.ok(removed.has("targetAddress"), "what the seller pointed it at");
  assert.ok(removed.has("credentialId"), "their key reference");
  assert.ok(removed.has("delivery"), "where their results went");
  assert.ok(removed.has("ownerEmail"), "who they are");
  assert.ok(removed.has("lastObservation"), "and what it last saw");
});

test("what makes the agent worth buying is published", () => {
  // The other half. A disclosure that withheld everything would be perfectly
  // safe and completely worthless.
  const included = new Set<string>(PUBLISHED_FIELDS);

  assert.ok(included.has("objective"));
  assert.ok(included.has("rules"));
  assert.ok(included.has("sources"));
  assert.ok(included.has("schedule"));
});

test("a seller sees both columns before anything publishes", () => {
  const disclosure = sellerDisclosure();

  assert.ok(disclosure.included.length > 0);
  assert.ok(disclosure.removed.length > 0);
  assert.equal(
    disclosure.included.length + disclosure.removed.length,
    PUBLISHED_FIELDS.length + WITHHELD_FIELDS.length,
    "the screen shows everything, not a selection",
  );
});

test("a seller writes claims, not measurements", () => {
  assert.equal(isAuthoredBySeller("description"), true, "what it is for is a claim");
  assert.equal(isAuthoredBySeller("name"), true);
  assert.equal(isAuthoredBySeller("price"), true);

  assert.equal(isAuthoredBySeller("verifiedRuns"), false, "how often it ran is not");
  assert.equal(isAuthoredBySeller("successRate"), false);
  assert.equal(isDerived("successRate"), true);
});

test("a seller supplying their own run count is ignored, not trusted", () => {
  // A listing whose numbers can be typed in is marketing with a figure on it,
  // which is what everything else selling agents already is.
  const card = buildCard(
    { name: "Volume surge screener", description: "flags unusual volume", price: 0, verifiedRuns: 9_999, successRate: 100 },
    { verifiedRuns: 12, successRate: 100, category: "Signals", agentType: "SIGNAL", salesCount: 0 },
  );

  assert.equal(card.verifiedRuns, 12, "the measured value wins");
  assert.equal(card.description, "flags unusual volume", "while the claim survives");
});

test("a seller cannot invent a field onto the card", () => {
  const card = buildCard({ name: "x", description: "y", price: 0, endorsedBy: "somebody" }, {});

  assert.equal("endorsedBy" in card, false, "only known fields reach a buyer");
});

test("a card is honest when its numbers match the agent behind it", () => {
  const measured = { verifiedRuns: 12, successRate: 100, category: "Signals", agentType: "SIGNAL", salesCount: 3 };
  const card = buildCard({ name: "x", description: "y", price: 0 }, measured);

  assert.equal(cardIsHonest(card, measured), true);
  assert.equal(cardIsHonest({ ...card, verifiedRuns: 400 }, measured), false, "an edited number is caught");
});

test("authored and derived never overlap", () => {
  // A field that was both would be settable by the seller and presented as
  // measured, which is the exact thing this separation exists to prevent.
  const derived = new Set<string>(DERIVED_FIELDS);

  assert.ok(!AUTHORED_FIELDS.some((field) => derived.has(field)));
});
