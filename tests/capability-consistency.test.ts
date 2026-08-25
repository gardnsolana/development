import assert from "node:assert/strict";
import test from "node:test";

import {
  blockingCapabilities,
  isDeployable,
  isGenuineGap,
  reconcileNeeds,
  type Capability,
} from "../packages/contracts/src/capability-consistency.ts";

const catalogue: Capability[] = [
  { id: "solana.token.read", label: "Solana token data", status: "ready", detail: "" },
  { id: "research.web", label: "Web endpoint reads", status: "ready", detail: "" },
  { id: "delivery.app", label: "GARDN inbox", status: "ready", detail: "" },
  { id: "research.web.search", label: "Web search", status: "unsupported", detail: "" },
  { id: "delivery.telegram", label: "Telegram delivery", status: "unsupported", detail: "" },
  { id: "runtime.schedule", label: "Managed schedule", status: "setup_required", detail: "" },
  { id: "wallet.execute", label: "Wallet execution", status: "approval_required", detail: "" },
];

test("a gap claimed against a ready capability is dropped", () => {
  // This is the bug it prevents: a planner naming a capability the runtime has,
  // which marked a perfectly deployable agent as blocked.
  const needs = reconcileNeeds(
    [{ capabilityId: "research.web", reason: "GARDN cannot read the web." }],
    catalogue,
  );

  assert.deepEqual(needs, []);
});

test("a genuine gap is always kept", () => {
  const needs = reconcileNeeds(
    [{ capabilityId: "delivery.telegram", reason: "Telegram is not connected." }],
    catalogue,
  );

  assert.equal(needs.length, 1);
  assert.equal(needs[0]?.capabilityId, "delivery.telegram");
});

test("real gaps survive alongside mistaken ones", () => {
  const needs = reconcileNeeds([
    { capabilityId: "research.web", reason: "wrongly claimed" },
    { capabilityId: "research.web.search", reason: "cannot search the web" },
    { capabilityId: "delivery.telegram", reason: "not connected" },
  ], catalogue);

  assert.deepEqual(needs.map((need) => need.capabilityId), ["research.web.search", "delivery.telegram"]);
});

test("a capability absent from the catalogue is treated as a real gap", () => {
  const unknown = { capabilityId: "some.future.thing", reason: "not built" };

  assert.equal(isGenuineGap(unknown, catalogue), true);
  assert.equal(reconcileNeeds([unknown], catalogue).length, 1);
});

test("duplicate claims collapse to one", () => {
  const needs = reconcileNeeds([
    { capabilityId: "delivery.telegram", reason: "first" },
    { capabilityId: "delivery.telegram", reason: "again" },
  ], catalogue);

  assert.equal(needs.length, 1);
  assert.equal(needs[0]?.reason, "first");
});

test("only a ready capability can carry a plan", () => {
  const blocking = blockingCapabilities(catalogue).map((capability) => capability.id);

  assert.ok(blocking.includes("runtime.schedule"), "setup_required blocks");
  assert.ok(blocking.includes("research.web.search"), "unsupported blocks");
  assert.ok(blocking.includes("wallet.execute"), "approval_required blocks");
  assert.ok(!blocking.includes("research.web"), "ready does not block");
});

test("a plan deploys when everything it needs is ready and no real gap remains", () => {
  const required = catalogue.filter((capability) => ["solana.token.read", "research.web", "delivery.app"].includes(capability.id));

  assert.equal(isDeployable(required, []), true);
  assert.equal(
    isDeployable(required, [{ capabilityId: "research.web", reason: "mistaken claim" }]),
    true,
    "a mistaken claim never blocks a deployable plan",
  );
  assert.equal(
    isDeployable(required, [{ capabilityId: "delivery.telegram", reason: "not connected" }]),
    false,
    "a real gap does block",
  );
});

test("a plan requiring an unready capability cannot deploy", () => {
  const required = catalogue.filter((capability) => ["research.web", "runtime.schedule"].includes(capability.id));

  assert.equal(isDeployable(required, []), false);
});
