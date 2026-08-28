/**
 * Buying the same agent twice is buying it once.
 *
 * A purchase is the one action in the product that moves money and cannot be
 * quietly retried. Yet it is triggered by exactly the things that retry: a
 * button someone pressed twice because the first click seemed slow, a network
 * that dropped after the request arrived but before the response came back, a
 * client that reconnected and sent it again.
 *
 * The usual defence is a request id minted by the caller. That is not enough
 * here, because the caller is a browser and the retry frequently comes from a
 * different page load with a different id. So identity is derived from the
 * facts instead: who is buying, and what they are buying. Those are the same on
 * every retry, whatever the client thinks.
 *
 * The consequence is that ownership becomes a function of the buyer and the
 * listing rather than of the order things happened in. A second attempt cannot
 * create a second fork, cannot create a second charge, and returns what the
 * first attempt already produced.
 */

/**
 * The canonical identity of one person owning one listing.
 *
 * Derived only from facts that are identical on every retry. Nothing about the
 * current time, no counter, no client-supplied id — each of those would differ
 * between attempts and defeat the whole mechanism at exactly the moment it is
 * needed.
 */
export function ownershipKey(buyerEmail: string, listingId: string): string {
  return JSON.stringify({ buyerEmail: buyerEmail.trim().toLowerCase(), listingId: listingId.trim() });
}

/**
 * Whether two purchase attempts are the same purchase.
 *
 * Buyer identity is compared case-insensitively, because an address that
 * differs only in capitalisation is the same person and must not be able to buy
 * the same listing twice.
 */
export function isSamePurchase(
  left: { buyerEmail: string; listingId: string },
  right: { buyerEmail: string; listingId: string },
): boolean {
  return ownershipKey(left.buyerEmail, left.listingId) === ownershipKey(right.buyerEmail, right.listingId);
}

export type PurchaseRecord = {
  id: string;
  listingId: string;
  buyerEmail: string;
  forkedAgentId: string;
};

export type PurchaseOutcome =
  | { created: true; record: PurchaseRecord }
  /** The buyer already owns this. Nothing was charged and nothing was created. */
  | { created: false; record: PurchaseRecord; alreadyOwned: true };

/**
 * What happens when someone buys something they already own.
 *
 * Returning what they already have is the correct answer, not an error. From
 * the buyer's side the outcome is identical to the first attempt succeeding,
 * which is exactly what they believed happened — and an error here would
 * suggest something went wrong when nothing did.
 */
export function resolvePurchase(existing: PurchaseRecord | null, create: () => PurchaseRecord): PurchaseOutcome {
  if (existing) return { created: false, record: existing, alreadyOwned: true };
  return { created: true, record: create() };
}

/**
 * Whether a set of records could only have come from distinct purchases.
 *
 * The invariant a ledger has to hold: one buyer, one listing, one row. Two rows
 * for the same pair means somebody was charged twice.
 */
export function hasNoDuplicates(records: readonly Pick<PurchaseRecord, "buyerEmail" | "listingId">[]): boolean {
  const seen = new Set<string>();
  for (const record of records) {
    const key = ownershipKey(record.buyerEmail, record.listingId);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Whether a fork belongs to the person claiming it.
 *
 * A fork id derived from the ownership key is stable and guessable by design —
 * it is derived from a listing id and an email, neither of which is secret. So
 * it is never treated as proof of anything on its own; ownership is checked
 * against the record.
 */
export function isOwnedBy(record: PurchaseRecord, buyerEmail: string): boolean {
  return record.buyerEmail.trim().toLowerCase() === buyerEmail.trim().toLowerCase();
}
