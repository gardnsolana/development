import assert from "node:assert/strict";
import test from "node:test";

import {
  FAILURES_BEFORE_PAUSE,
  STALE_AFTER_MS,
  afterFailure,
  afterSuccess,
  isSchedulerAlive,
  isStale,
  shouldPause,
  type AgentRuntimeState,
} from "../packages/contracts/src/unattended-health.ts";

const now = new Date("2026-08-27T18:00:00.000Z");
const live: AgentRuntimeState = { status: "live", consecutiveFailures: 0, lastError: null };

test("an agent that keeps failing stops itself", () => {
  // Nothing else about an unattended agent draws attention. Pausing is not a
  // punishment — it is the only way the failure becomes visible.
  let state = live;
  for (let attempt = 0; attempt < FAILURES_BEFORE_PAUSE; attempt += 1) {
    state = afterFailure(state, "the endpoint could not be reached");
  }

  assert.equal(state.status, "paused");
  assert.equal(state.consecutiveFailures, FAILURES_BEFORE_PAUSE);
  assert.ok(state.lastError, "and it says why");
});

test("one bad response does not pause a working agent", () => {
  const state = afterFailure(live, "a blip");

  assert.equal(state.status, "live", "a source having a moment is not a broken agent");
  assert.ok(state.lastError, "but it is still recorded");
});

test("a success clears the count", () => {
  // Five failures spread across a working week are not a broken agent. Only
  // consecutive ones are evidence of anything.
  let state = afterFailure(afterFailure(afterFailure(live, "a"), "b"), "c");
  assert.equal(state.consecutiveFailures, 3);

  state = afterSuccess(state);
  assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.lastError, null, "and the stale error is cleared with it");
  assert.equal(state.status, "live");
});

test("an already paused agent is not paused again", () => {
  const paused: AgentRuntimeState = { status: "paused", consecutiveFailures: 9, lastError: "broken" };

  assert.equal(shouldPause(paused), false, "it is already out of the schedule");
});

test("the threshold is neither hair-trigger nor useless", () => {
  assert.ok(FAILURES_BEFORE_PAUSE >= 3, "a couple of failures is not a pattern");
  assert.ok(FAILURES_BEFORE_PAUSE <= 10, "and a broken agent should stop within the hour on most cadences");
});

test("a job abandoned by a dead worker is recovered", () => {
  // A worker can be killed mid-job by a deploy, an eviction, or a crash.
  // Nothing releases the claim, so the job sits running forever and that agent
  // silently never runs again. This is the failure that looks most like
  // nothing being wrong.
  const longAgo = new Date(now.getTime() - STALE_AFTER_MS - 1_000).toISOString();
  const justNow = new Date(now.getTime() - 1_000).toISOString();

  assert.equal(isStale(longAgo, now), true);
  assert.equal(isStale(justNow, now), false, "a job still working is left alone");
  assert.equal(isStale(null, now), false, "an unclaimed job is not stale");
});

test("an unreadable claim time is treated as abandoned", () => {
  // Erring the other way would strand the job permanently, which is the outcome
  // recovery exists to prevent.
  assert.equal(isStale("not a date", now), true);
});

test("the scheduler itself is watched, not just the agents", () => {
  // No individual agent can report that the scheduler stopped, because the
  // thing that would report it is the thing that stopped.
  const everyFiveMinutes = 5 * 60_000;
  const recent = { key: "runtime_scheduler", status: "healthy" as const, checkedAt: new Date(now.getTime() - 60_000).toISOString() };

  assert.equal(isSchedulerAlive(recent, now, everyFiveMinutes), true);
  assert.equal(isSchedulerAlive(null, now, everyFiveMinutes), false, "never heard from is not alive");

  const ancient = { ...recent, checkedAt: new Date(now.getTime() - 60 * 60_000).toISOString() };
  assert.equal(isSchedulerAlive(ancient, now, everyFiveMinutes), false, "an hour of silence on a five minute tick");
});

test("one missed tick is a blip, not an outage", () => {
  const everyFiveMinutes = 5 * 60_000;
  const oneMissed = {
    key: "runtime_scheduler",
    status: "healthy" as const,
    checkedAt: new Date(now.getTime() - everyFiveMinutes - 30_000).toISOString(),
  };

  assert.equal(isSchedulerAlive(oneMissed, now, everyFiveMinutes), true, "a single skipped tick does not raise an alarm");
});
