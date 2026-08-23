import assert from "node:assert/strict";
import test from "node:test";

import {
  clockGroundTruth,
  measureFreshness,
} from "../packages/contracts/src/observation-freshness.ts";

const now = "2026-08-23T08:00:00.000Z";

test("an observation taken moments ago is fresh", () => {
  const freshness = measureFreshness("2026-08-23T07:59:59.000Z", now)!;

  assert.equal(freshness.band, "fresh");
  assert.equal(freshness.ahead, false);
  assert.equal(freshness.ageMs, 1000);
});

test("freshness bands widen with age", () => {
  assert.equal(measureFreshness("2026-08-23T07:55:00.000Z", now)!.band, "recent");
  assert.equal(measureFreshness("2026-08-23T07:30:00.000Z", now)!.band, "aging");
  assert.equal(measureFreshness("2026-08-22T08:00:00.000Z", now)!.band, "stale");
});

test("a far-future current time is honoured, not doubted", () => {
  // The clock is ground truth even when it is long after any training data.
  const freshness = measureFreshness("2031-01-01T11:59:30.000Z", "2031-01-01T12:00:00.000Z")!;

  assert.equal(freshness.band, "fresh");
  assert.equal(freshness.ahead, false);
});

test("ordinary clock skew is tolerated rather than flagged", () => {
  const slightlyAhead = measureFreshness("2026-08-23T08:00:02.000Z", now)!;
  assert.equal(slightlyAhead.ahead, false);
  assert.equal(slightlyAhead.band, "fresh");

  const genuinelyAhead = measureFreshness("2026-08-23T09:00:00.000Z", now)!;
  assert.equal(genuinelyAhead.ahead, true);
});

test("unparseable timestamps yield no judgement at all", () => {
  assert.equal(measureFreshness("not-a-date", now), null);
  assert.equal(measureFreshness(now, undefined), null);
  assert.equal(measureFreshness(null, now), null);
});

test("the clock statement names the time and forbids treating it as an anomaly", () => {
  const statement = clockGroundTruth(now);

  assert.ok(statement.includes(now));
  assert.match(statement, /authoritative/i);
  assert.match(statement, /later than your training data/i);
  assert.match(statement, /never treat the current date/i);
});
