/**
 * What a buyer is entitled to when the thing they bought changes afterwards.
 *
 * A listing is not fixed. A seller improves the agent behind it, republishes,
 * and the listing now describes something different from what somebody bought
 * last week. That is normal and desirable — but it creates a question the
 * marketplace has to answer honestly: which version does an existing buyer own?
 *
 * The answer here is the version that existed when they bought it. A fork is a
 * copy taken at a moment, not a subscription to whatever the seller does next.
 * Any other answer means a seller can silently alter something already sold —
 * and since a definition is executable, that would be the ability to change
 * what somebody else's agent does, remotely, after the fact.
 *
 * So every publication is kept, each with its own checksum, and a purchase
 * records which one it took.
 */

export type ListingVersion = {
  listingId: string;
  version: number;
  /** Fingerprint of the definition at this version. See `definition-integrity`. */
  checksum: string;
  changeSummary: string;
  createdAt: string;
};

/** The version number a listing starts at. */
export const FIRST_VERSION = 1;

/**
 * The next version number for a listing.
 *
 * Monotonic and gapless. A version number that could repeat would make a
 * purchase record ambiguous about what was actually bought.
 */
export function nextVersion(existing: readonly ListingVersion[]): number {
  return existing.reduce((highest, entry) => Math.max(highest, entry.version), 0) + 1;
}

/**
 * Whether republishing actually changed anything.
 *
 * A republication that produces an identical definition should not create a
 * version, or version history becomes a log of saves rather than a record of
 * changes.
 */
export function isMaterialChange(previous: ListingVersion | null, checksum: string): boolean {
  return !previous || previous.checksum !== checksum;
}

export type Purchase = {
  listingId: string;
  buyerEmail: string;
  /** The version this buyer actually took. */
  version: number;
};

/**
 * The version a buyer owns, which is the one they bought.
 *
 * Never the latest. A definition is executable, so serving a newer version to
 * an existing owner would mean a seller could change what somebody else's agent
 * does after they own it.
 */
export function versionOwnedBy(purchase: Purchase, versions: readonly ListingVersion[]): ListingVersion | null {
  return versions.find((entry) => entry.listingId === purchase.listingId && entry.version === purchase.version) ?? null;
}

/** Whether a buyer is running something older than what is now listed. */
export function isOutdated(purchase: Purchase, versions: readonly ListingVersion[]): boolean {
  const latest = versions.reduce((highest, entry) => Math.max(highest, entry.version), 0);
  return purchase.version < latest;
}

/**
 * What an existing owner is offered when a newer version exists.
 *
 * Told, not upgraded. The choice belongs to the person running it — an agent
 * that changed behaviour on its own because someone else edited a listing would
 * be indistinguishable from it being compromised.
 */
export function upgradeNotice(purchase: Purchase, versions: readonly ListingVersion[]): string | null {
  if (!isOutdated(purchase, versions)) return null;
  const latest = versions
    .filter((entry) => entry.listingId === purchase.listingId)
    .reduce<ListingVersion | null>((newest, entry) => (!newest || entry.version > newest.version ? entry : newest), null);
  return latest
    ? `Version ${latest.version} is available: ${latest.changeSummary}. Your copy stays on version ${purchase.version} until you take it.`
    : null;
}

/**
 * Whether the history is sound enough to answer ownership questions.
 *
 * Duplicated version numbers make a purchase record ambiguous, which is the one
 * thing this whole mechanism exists to prevent.
 */
export function isCoherentHistory(versions: readonly ListingVersion[]): boolean {
  const seen = new Set<string>();
  for (const entry of versions) {
    if (!Number.isInteger(entry.version) || entry.version < FIRST_VERSION) return false;
    const key = `${entry.listingId}:${entry.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
