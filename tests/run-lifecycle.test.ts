import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionRun,
  createRunRecord,
  isTerminalRunStatus,
  transitionRun,
} from "../packages/contracts/src/run-lifecycle.ts";

const createdAt = "2026-08-17T09:00:00.000Z";

test("creates a queued run against one definition revision", () => {
  const run = createRunRecord({
    id: "run_001",
    definitionId: "agent_wallet_watch",
    definitionRevision: 3,
    createdAt,
  });

  assert.equal(run.status, "queued");
  assert.equal(run.definitionRevision, 3);
  assert.equal(run.startedAt, null);
  assert.equal(run.completedAt, null);
});

test("records start and completion timestamps", () => {
  const queued = createRunRecord({
    id: "run_002",
    definitionId: "agent_wallet_watch",
    definitionRevision: 3,
    createdAt,
  });
  const running = transitionRun(queued, "running", "2026-08-17T09:00:02.000Z");
  const succeeded = transitionRun(running, "succeeded", "2026-08-17T09:00:08.000Z");

  assert.equal(running.startedAt, "2026-08-17T09:00:02.000Z");
  assert.equal(succeeded.startedAt, running.startedAt);
  assert.equal(succeeded.completedAt, "2026-08-17T09:00:08.000Z");
  assert.equal(isTerminalRunStatus(succeeded.status), true);
});

test("blocks skipping the running state", () => {
  const run = createRunRecord({
    id: "run_003",
    definitionId: "agent_token_watch",
    definitionRevision: 1,
    createdAt,
  });

  assert.equal(canTransitionRun("queued", "succeeded"), false);
  assert.throws(() => transitionRun(run, "succeeded"), /cannot transition/);
});

test("keeps terminal run records terminal", () => {
  const queued = createRunRecord({
    id: "run_004",
    definitionId: "agent_token_watch",
    definitionRevision: 1,
    createdAt,
  });
  const cancelled = transitionRun(queued, "cancelled", "2026-08-17T09:00:01.000Z");

  assert.equal(cancelled.completedAt, "2026-08-17T09:00:01.000Z");
  assert.throws(() => transitionRun(cancelled, "running"), /cannot transition/);
});

test("rejects malformed run identifiers and revisions", () => {
  assert.throws(
    () => createRunRecord({ id: "?", definitionId: "agent_valid", definitionRevision: 1 }),
    /stable identifier/,
  );
  assert.throws(
    () => createRunRecord({ id: "run_valid", definitionId: "agent_valid", definitionRevision: 0 }),
    /positive integer/,
  );
});
