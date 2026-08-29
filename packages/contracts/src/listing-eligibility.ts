/**
 * What may be listed, by whom, and at what price.
 *
 * The rule that shapes everything else: an agent cannot be sold on the strength
 * of its description. It has to have been deployed and to have actually run at
 * least once. That single precondition is what stops a marketplace filling with
 * definitions nobody has executed — the failure mode every agent marketplace
 * arrives at, where each listing claims something and none can show anything.
 *
 * The second idea is that a seller does not get to describe their own track
 * record. Run counts and success rates are copied from the agent at the moment
 * of publication, not supplied by whoever is publishing. A seller writes the
 * name and the description; the numbers are taken.
 *
 * And a definition is sanitised on the way *in*, not on the way out. The
 * seller's target and credential reference never enter the listing at all, so
 * they cannot leak from one even if something downstream is wrong. See
 * `marketplace-fork` for what a buyer receives; this is the earlier point where
 * the private parts are removed.
 */

export type SourceAgent = {
  ownerEmail: string;
  status: string;
  /** How many times this agent has actually executed. */
  runCount: number;
  successCount: number;
};

export type ListingDraft = {
  name: string;
  description: string;
  /** Whole cents. Zero means free. */
  priceCents: number;
};

/** Highest price a listing may carry, in cents. */
export const MAX_PRICE_CENTS = 50_000;

export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;

export type Ineligibility =
  | "not-owner"
  | "not-deployed"
  | "never-run"
  | "missing-details"
  | "price-out-of-range"
  | "no-payout-wallet";

/**
 * Whether this person may publish this agent.
 *
 * Ownership first: publishing something you do not own is not a pricing
 * question. Then the substance — deployed, and proven by having run.
 */
export function ineligibleReason(
  agent: SourceAgent,
  draft: ListingDraft,
  context: { sellerEmail: string; hasVerifiedPayoutWallet: boolean },
): Ineligibility | null {
  if (agent.ownerEmail.trim().toLowerCase() !== context.sellerEmail.trim().toLowerCase()) return "not-owner";
  if (agent.status !== "live") return "not-deployed";
  // The precondition that keeps the catalogue worth browsing.
  if (agent.runCount < 1) return "never-run";
  if (!draft.name.trim() || !draft.description.trim()) return "missing-details";
  if (!isValidPrice(draft.priceCents)) return "price-out-of-range";
  // A priced listing with nowhere to pay the seller would take money it cannot
  // forward, so the wallet is required before publication rather than at the
  // first sale.
  if (draft.priceCents > 0 && !context.hasVerifiedPayoutWallet) return "no-payout-wallet";
  return null;
}

export function canPublish(
  agent: SourceAgent,
  draft: ListingDraft,
  context: { sellerEmail: string; hasVerifiedPayoutWallet: boolean },
): boolean {
  return ineligibleReason(agent, draft, context) === null;
}

/**
 * A price has to be whole cents and within range.
 *
 * Fractional cents cannot be settled — the on-chain amount would round and the
 * split would no longer reconcile against what the buyer agreed to.
 */
export function isValidPrice(priceCents: unknown): boolean {
  return (
    typeof priceCents === "number" &&
    Number.isInteger(priceCents) &&
    priceCents >= 0 &&
    priceCents <= MAX_PRICE_CENTS
  );
}

/** Turns whatever a form supplied into whole cents inside the allowed range. */
export function normalisePrice(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(MAX_PRICE_CENTS, Math.max(0, Math.round(amount * 100)));
}

export type TrackRecord = {
  verifiedRuns: number;
  successRate: number;
};

/**
 * The track record shown on a listing.
 *
 * Taken from the agent, never accepted from the seller. A listing may describe
 * what an agent is for; it does not get to describe how well it has worked.
 */
export function trackRecordFrom(agent: SourceAgent): TrackRecord {
  return {
    verifiedRuns: Math.max(0, agent.runCount),
    successRate: agent.runCount > 0 ? Math.round((agent.successCount / agent.runCount) * 100) : 0,
  };
}

/** Whether a listing's advertised record matches the agent it was published from. */
export function recordMatchesAgent(listed: TrackRecord, agent: SourceAgent): boolean {
  const actual = trackRecordFrom(agent);
  return listed.verifiedRuns === actual.verifiedRuns && listed.successRate === actual.successRate;
}
