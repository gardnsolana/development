import assert from "node:assert/strict";
import test from "node:test";

import {
  CADENCE_SECONDS,
  isDue,
  isScheduled,
  nextRunAt,
} from "../packages/contracts/src/schedule-cadence.ts";

const from = new Date("2026-01-01T00:00:00.000Z");

test("manual agents never self-schedule", () => {
  assert.equal(isScheduled("Manual"), false);
  assert.equal(nextRunAt("Manual", from), null);
  assert.equal(CADENCE_SECONDS.Manual, null);
});

test("each cadence advances by its interval", () => {
  assert.equal(nextRunAt("Every 5 minutes", from), "2026-01-01T00:05:00.000Z");
  assert.equal(nextRunAt("Hourly", from), "2026-01-01T01:00:00.000Z");
  assert.equal(nextRunAt("Daily", from), "2026-01-02T00:00:00.000Z");
});

test("scheduled agents are flagged", () => {
  assert.equal(isScheduled("Hourly"), true);
  assert.equal(isScheduled("Daily"), true);
});

test("a run is due only once its next time has passed", () => {
  const next = nextRunAt("Hourly", from);
  assert.equal(isDue(next, new Date("2026-01-01T00:59:59.000Z")), false);
  assert.equal(isDue(next, new Date("2026-01-01T01:00:00.000Z")), true);
  assert.equal(isDue(null, new Date()), false);
});

test("an invalid from date is rejected", () => {
  assert.throws(() => nextRunAt("Hourly", new Date("nope")));
});
