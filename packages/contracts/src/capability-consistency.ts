/**
 * The capability catalogue is the authority on what the runtime can do — not
 * the model's recollection of it.
 *
 * A planner asked to list what it cannot do will sometimes name a capability
 * the runtime genuinely has. Left alone that marks a perfectly deployable agent
 * as blocked, and the person is told to go and find a workaround for something
 * that already works. So every claimed gap is checked against the catalogue,
 * and anything reported as ready is dropped from the list.
 *
 * The reverse never happens: a capability the runtime lacks is always reported,
 * whether or not the model thought to mention it.
 */

export type CapabilityStatus = "ready" | "setup_required" | "unsupported" | "approval_required";

export type Capability = {
  id: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
};

export type UnsupportedNeed = {
  capabilityId: string;
  reason: string;
};

export function isReady(capability: Capability): boolean {
  return capability.status === "ready";
}

/** Only a ready capability can carry a plan. Anything else has to be resolved first. */
export function blockingCapabilities(capabilities: readonly Capability[]): Capability[] {
  return capabilities.filter((capability) => !isReady(capability));
}

/**
 * Drops claimed gaps that the catalogue reports as ready. This is the rule that
 * stops a deployable agent being marked blocked by a mistaken claim.
 */
export function reconcileNeeds(
  claimed: readonly UnsupportedNeed[],
  capabilities: readonly Capability[],
): UnsupportedNeed[] {
  const ready = new Set(capabilities.filter(isReady).map((capability) => capability.id));
  const seen = new Set<string>();

  return claimed.filter((need) => {
    if (ready.has(need.capabilityId)) return false;
    if (seen.has(need.capabilityId)) return false;
    seen.add(need.capabilityId);
    return true;
  });
}

/**
 * A plan can deploy when every capability it requires is ready and nothing
 * genuinely unavailable is still outstanding.
 */
export function isDeployable(
  required: readonly Capability[],
  claimed: readonly UnsupportedNeed[],
): boolean {
  return blockingCapabilities(required).length === 0
    && reconcileNeeds(claimed, required).length === 0;
}

/**
 * Whether a claimed gap is consistent with the catalogue at all. Useful for
 * spotting a planner drifting out of step with what the runtime supports.
 */
export function isGenuineGap(need: UnsupportedNeed, capabilities: readonly Capability[]): boolean {
  const match = capabilities.find((capability) => capability.id === need.capabilityId);
  return !match || !isReady(match);
}
