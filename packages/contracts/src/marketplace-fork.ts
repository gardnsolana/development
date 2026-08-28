/**
 * What a buyer actually receives when they take an agent.
 *
 * The word doing the work is *fork*. A buyer does not get access to the
 * seller's running agent — they get an independent copy of its definition,
 * which then belongs to them and runs on their account. Nobody can switch it
 * off, and nothing the buyer does afterwards reaches back to the original.
 *
 * That only holds if the copy is stripped of everything personal to the seller.
 * A definition carries more than logic: it carries the target it was pointed
 * at, the delivery it was wired to, and a reference to whatever credential ran
 * it. None of that is the buyer's, and some of it is nobody's business.
 *
 * The subtle one is the target. A definition that arrived still pointed at the
 * seller's wallet would, the moment the buyer deployed it, start reading an
 * address they never chose and were never shown. So a fork arrives inert: no
 * target, and not live. The buyer has to point it at something and prove it
 * themselves before it does anything at all.
 *
 * See `credential-transfer` for how the requirement to hold a key survives a
 * sale while the key itself never does.
 */

export type ForkableDefinition = {
  name: string;
  objective: string;
  category: string;
  /** Where the original was pointed. Never travels. */
  targetAddress: string;
  targetKind: string;
  /** Where results went for the seller. Reset rather than inherited. */
  delivery: string;
  schedule: string;
  rules: readonly unknown[];
  sources: readonly string[];
  /** A reference to the seller's credential, if the original used one. */
  credentialId?: string | null;
  /** How the definition was produced. Restamped so its origin is not lost. */
  origin?: string;
};

/** The status a fork is created in. Never live, never running. */
export const FORK_STATUS = "draft";

/** Delivery every fork resets to: visible in the buyer's own app, wired to nothing. */
export const DEFAULT_DELIVERY = "App only";

/**
 * Strips a definition down to what may legitimately change hands.
 *
 * Deterministic on purpose. The same listing sanitises to the same definition
 * every time, which is what allows a buyer to verify that what they received
 * matches what was advertised — see `definition-integrity`.
 */
export function sanitiseForFork(definition: ForkableDefinition): ForkableDefinition {
  return {
    ...definition,
    // The seller's target is theirs. A fork points nowhere until the buyer says so.
    targetAddress: "",
    delivery: DEFAULT_DELIVERY,
    credentialId: null,
    origin: "marketplace",
  };
}

/** Whether a definition is safe to hand to a buyer. */
export function isSafeToTransfer(definition: ForkableDefinition): boolean {
  return definition.targetAddress === "" && !definition.credentialId && definition.delivery === DEFAULT_DELIVERY;
}

/**
 * What is kept, stated positively.
 *
 * A fork is worth having because the thinking survives: the objective, the
 * rules, the sources it reads and the cadence it was designed around. Stripping
 * the personal parts must not quietly strip the useful ones, or a buyer
 * receives an empty shell that technically passes every safety check.
 */
export function retainsLogic(original: ForkableDefinition, fork: ForkableDefinition): boolean {
  return (
    fork.objective === original.objective &&
    fork.targetKind === original.targetKind &&
    fork.schedule === original.schedule &&
    fork.rules.length === original.rules.length &&
    fork.sources.length === original.sources.length
  );
}

/**
 * What a buyer is shown before they commit.
 *
 * A requirement discovered after purchase is worse than a smaller catalogue, so
 * anything the agent needs and does not come with is disclosed up front.
 */
export function purchaseDisclosure(definition: ForkableDefinition, requirement: string | null): string[] {
  const notes = [
    "You receive an independent copy of this definition.",
    "It arrives without a target — you choose what it reads.",
  ];
  if (requirement) notes.push(`Requires your own ${requirement} key.`);
  if (definition.schedule && definition.schedule !== "Manual only") {
    notes.push(`Designed to run ${definition.schedule.toLowerCase()} once you deploy it.`);
  }
  return notes;
}
