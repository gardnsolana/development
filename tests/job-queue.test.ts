import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TICK_LIMIT,
  claimable,
  isClaimable,
  isCoherent,
  isSameWork,
  scheduleKey,
  tickStatus,
  type Job,
} from "../packages/contracts/src/job-queue.ts";

const now = new Date("2026-08-27T18:00:00.000Z");

const job = (over: Partial<Job> = {}): Job => ({
  id: "job_1",
  agentId: "agent_1",
  ownerEmail: "owner@gardn.test",
  trigger: "schedule",
  status: "queued",
  idempotencyKey: scheduleKey("agent_1", "2026-08-27T18:00:00.000Z"),
  attempts: 0,
  maxAttempts: 3,
  availableAt: "2026-08-27T17:59:00.000Z",
  ...over,
});

test("one due moment is one unit of work, however many ticks see it", () => {
  // Two ticks racing over the same due agent must produce one job. A person who
  // clicks twice notices; a timer that fires twice does not.
  const first = scheduleKey("agent_1", "2026-08-27T18:00:00.000Z");
  const second = scheduleKey("agent_1", "2026-08-27T18:00:00.000Z");

  assert.equal(first, second);
  assert.equal(isSameWork({ idempotencyKey: first }, { idempotencyKey: second }), true);
});

test("a different due moment is different work", () => {
  const at18 = scheduleKey("agent_1", "2026-08-27T18:00:00.000Z");
  const at19 = scheduleKey("agent_1", "2026-08-27T19:00:00.000Z");

  assert.notEqual(at18, at19, "an agent still runs once per due moment");
});

test("two agents due at the same moment are separate work", () => {
  assert.notEqual(
    scheduleKey("agent_1", "2026-08-27T18:00:00.000Z"),
    scheduleKey("agent_2", "2026-08-27T18:00:00.000Z"),
  );
});

test("the key never depends on the current time", () => {
  // A key built from "now" would differ between two racing ticks and defeat the
  // entire mechanism, silently, only under load.
  const key = scheduleKey("agent_1", "2026-08-27T18:00:00.000Z");

  assert.ok(key.includes("2026-08-27T18:00:00.000Z"), "it names the due moment");
  assert.ok(!key.includes(new Date().getFullYear() + "-" + String(new Date().getMonth() + 1)), "and nothing about now");
});

test("only a queued, due job can be claimed", () => {
  assert.equal(isClaimable(job(), now), true);
  assert.equal(isClaimable(job({ status: "running" }), now), false, "already claimed by another tick");
  assert.equal(isClaimable(job({ status: "succeeded" }), now), false);
  assert.equal(isClaimable(job({ status: "dead" }), now), false);
  assert.equal(
    isClaimable(job({ availableAt: "2026-08-27T18:30:00.000Z" }), now),
    false,
    "a job held back for a retry is not this tick's business",
  );
});

test("a tick takes a bounded number of jobs and leaves the rest", () => {
  // An unbounded tick drains the backlog in one invocation, hits the platform
  // time limit, and fails both the jobs it was working and the ones it never
  // reached.
  const many = Array.from({ length: 25 }, (_, index) => job({ id: `job_${index}` }));
  const taken = claimable(many, now);

  assert.equal(taken.length, DEFAULT_TICK_LIMIT);
  assert.ok(DEFAULT_TICK_LIMIT > 0 && DEFAULT_TICK_LIMIT <= 25, "enough to make progress, few enough to finish");
});

test("the longest waiting job goes first", () => {
  const taken = claimable([
    job({ id: "newest", availableAt: "2026-08-27T17:59:00.000Z" }),
    job({ id: "oldest", availableAt: "2026-08-27T17:00:00.000Z" }),
    job({ id: "middle", availableAt: "2026-08-27T17:30:00.000Z" }),
  ], now);

  assert.deepEqual(taken.map((item) => item.id), ["oldest", "middle", "newest"], "a backlog drains in order");
});

test("a tick's own report has to add up", () => {
  // This report is the only visibility into a system nobody watches. One that
  // does not add up is worse than none, because it will be believed.
  assert.equal(isCoherent({ enqueued: 1, processed: 2, succeeded: 1, failed: 1 }), true);
  assert.equal(isCoherent({ enqueued: 0, processed: 0, succeeded: 0, failed: 0 }), true, "a quiet tick is coherent");

  assert.equal(isCoherent({ enqueued: 0, processed: 2, succeeded: 1, failed: 0 }), false, "a job that vanished");
  assert.equal(isCoherent({ enqueued: 0, processed: 1, succeeded: 1, failed: 1 }), false, "a job counted twice");
  assert.equal(isCoherent({ enqueued: -1, processed: 0, succeeded: 0, failed: 0 }), false);
});

test("a tick that failed work says so", () => {
  assert.equal(tickStatus({ enqueued: 0, processed: 2, succeeded: 2, failed: 0 }), "healthy");
  assert.equal(tickStatus({ enqueued: 0, processed: 0, succeeded: 0, failed: 0 }), "healthy", "idle is not unhealthy");
  assert.equal(tickStatus({ enqueued: 0, processed: 2, succeeded: 1, failed: 1 }), "degraded");
});
