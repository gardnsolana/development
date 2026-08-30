/**
 * What is shown to a seller before they publish, and to a buyer before they take.
 *
 * Two audiences, one idea: nobody should have to trust a summary of what is
 * happening when the actual partition can be shown.
 *
 * For the seller, that means the review screen is exhaustive rather than
 * illustrative. It lists what leaves and what stays, and every field of a
 * definition appears in exactly one of those columns. The failure this
 * prevents is the quiet one: a field added to the definition six months from
 * now that nobody remembered to classify, and which therefore ships to buyers
 * because the disclosure was a hand-written list rather than a partition.
 *
 * For the buyer, it means separating what a seller wrote from what the system
 * measured. A description is a claim and should read like one. A run count is
 * not, and must never be typed into a form — otherwise a listing is just
 * marketing with a number on it, which is what everything else selling agents
 * already is.
 */

/** Fields of a definition that are published with a listing. */
export const PUBLISHED_FIELDS = [
  "name",
  "objective",
  "category",
  "agentType",
  "mode",
  "schedule",
  "targetKind",
  "rules",
  "sources",
  "plan",
] as const;

/** Fields that never leave the seller's account. */
export const WITHHELD_FIELDS = [
  "targetAddress",
  "credentialId",
  "delivery",
  "ownerEmail",
  "lastObservation",
  "lastSignature",
  "runHistory",
] as const;

export type PublishedField = (typeof PUBLISHED_FIELDS)[number];
export type WithheldField = (typeof WITHHELD_FIELDS)[number];

/**
 * Whether every field of a definition has been explicitly classified.
 *
 * This is the property that keeps the review screen honest as the product
 * grows. An unclassified field is not assumed safe — it fails the check, and
 * whoever added it has to decide which column it belongs in.
 */
export function isExhaustive(definitionFields: readonly string[]): boolean {
  const classified = new Set<string>([...PUBLISHED_FIELDS, ...WITHHELD_FIELDS]);
  return definitionFields.every((field) => classified.has(field));
}

/** Fields present on a definition that nobody has classified yet. */
export function unclassifiedFields(definitionFields: readonly string[]): string[] {
  const classified = new Set<string>([...PUBLISHED_FIELDS, ...WITHHELD_FIELDS]);
  return definitionFields.filter((field) => !classified.has(field));
}

/** Nothing may be published and withheld at once, or the disclosure contradicts itself. */
export function hasNoOverlap(): boolean {
  const withheld = new Set<string>(WITHHELD_FIELDS);
  return !PUBLISHED_FIELDS.some((field) => withheld.has(field));
}

export type SellerDisclosure = {
  included: readonly string[];
  removed: readonly string[];
};

/** The two columns a seller is shown before anything is published. */
export function sellerDisclosure(): SellerDisclosure {
  return { included: PUBLISHED_FIELDS, removed: WITHHELD_FIELDS };
}

/**
 * Card fields a seller writes. Claims, and presented as such.
 */
export const AUTHORED_FIELDS = ["name", "description", "price"] as const;

/**
 * Card fields the system measures. Never accepted from a seller.
 *
 * A seller who could set these would be writing their own track record, and a
 * listing would be worth exactly as much as the honesty of whoever wrote it.
 */
export const DERIVED_FIELDS = ["verifiedRuns", "successRate", "category", "agentType", "salesCount"] as const;

export function isAuthoredBySeller(field: string): boolean {
  return (AUTHORED_FIELDS as readonly string[]).includes(field);
}

export function isDerived(field: string): boolean {
  return (DERIVED_FIELDS as readonly string[]).includes(field);
}

export type ListingCard = Record<string, unknown>;

/**
 * Composes what a buyer sees.
 *
 * Derived values are taken from the agent and applied last, so anything a
 * seller supplied under those names is overwritten rather than trusted. The
 * seller does not get an error for trying — the value is simply not theirs to
 * set, and silently ignoring it is more robust than validating against a list
 * of things people might attempt.
 */
export function buildCard(authored: Record<string, unknown>, measured: Record<string, unknown>): ListingCard {
  const card: ListingCard = {};
  for (const field of AUTHORED_FIELDS) {
    if (field in authored) card[field] = authored[field];
  }
  for (const field of DERIVED_FIELDS) {
    if (field in measured) card[field] = measured[field];
  }
  return card;
}

/** Whether a card's measured values still match the agent behind it. */
export function cardIsHonest(card: ListingCard, measured: Record<string, unknown>): boolean {
  return DERIVED_FIELDS.every((field) => !(field in measured) || card[field] === measured[field]);
}
