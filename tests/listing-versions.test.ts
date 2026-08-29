import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRST_VERSION,
  isCoherentHistory,
  isMaterialChange,
  isOutdated,
  nextVersion,
  upgradeNotice,
  versionOwnedBy,
  type ListingVersion,
} from "../packages/contracts/src/listing-versions.ts";

const version = (n: number, checksum: string, summary = "changed"): ListingVersion => ({
  listingId: "listing_whale",
  version: n,
  checksum,
  changeSummary: summary,
  createdAt: `2026-08-2${n}T00:00:00.000Z`,
});

const history = [version(1, "aaa", "first publication"), version(2, "bbb", "tightened the volume threshold")];

test("a buyer owns the version they bought, never the latest", () => {
  // A definition is executable. Serving a newer version to an existing owner
  // would mean a seller can change what somebody else's agent does after they
  // own it.
  const owned = versionOwnedBy({ listingId: "listing_whale", buyerEmail: "buyer@gardn.test", version: 1 }, history);

  assert.equal(owned?.version, 1);
  assert.equal(owned?.checksum, "aaa", "the definition they took, not the one now listed");
});

test("a purchase referring to a version that does not exist resolves to nothing", () => {
  // Better to answer with nothing than to guess and hand over a definition
  // nobody agreed to.
  assert.equal(versionOwnedBy({ listingId: "listing_whale", buyerEmail: "b@gardn.test", version: 9 }, history), null);
  assert.equal(versionOwnedBy({ listingId: "other_listing", buyerEmail: "b@gardn.test", version: 1 }, history), null);
});

test("version numbers only ever go up", () => {
  // A repeated version number makes a purchase record ambiguous about what was
  // actually bought.
  assert.equal(nextVersion([]), FIRST_VERSION);
  assert.equal(nextVersion(history), 3);
  assert.equal(nextVersion([version(5, "e"), version(2, "b")]), 6, "from the highest, not the last");
});

test("republishing something identical is not a new version", () => {
  // Otherwise history becomes a log of saves rather than a record of changes.
  assert.equal(isMaterialChange(version(2, "bbb"), "bbb"), false);
  assert.equal(isMaterialChange(version(2, "bbb"), "ccc"), true);
  assert.equal(isMaterialChange(null, "aaa"), true, "the first publication always counts");
});

test("an owner on an older version is told, not upgraded", () => {
  // An agent that changed behaviour on its own because somebody else edited a
  // listing would be indistinguishable from it being compromised.
  const purchase = { listingId: "listing_whale", buyerEmail: "buyer@gardn.test", version: 1 };

  assert.equal(isOutdated(purchase, history), true);

  const notice = upgradeNotice(purchase, history);
  assert.ok(notice?.includes("Version 2"));
  assert.ok(notice?.includes("tightened the volume threshold"), "and what changed");
  assert.ok(notice?.includes("stays on version 1"), "while making clear nothing moved on its own");
});

test("an owner on the current version is told nothing", () => {
  const current = { listingId: "listing_whale", buyerEmail: "buyer@gardn.test", version: 2 };

  assert.equal(isOutdated(current, history), false);
  assert.equal(upgradeNotice(current, history), null);
});

test("a history that cannot answer ownership questions is rejected", () => {
  assert.equal(isCoherentHistory(history), true);
  assert.equal(isCoherentHistory([]), true, "nothing published yet is coherent");

  assert.equal(isCoherentHistory([version(1, "a"), version(1, "b")]), false, "two versions numbered the same");
  assert.equal(isCoherentHistory([version(0, "a")]), false, "versions start at one");
  assert.equal(isCoherentHistory([{ ...version(1, "a"), version: 1.5 }]), false, "and are whole numbers");
});
