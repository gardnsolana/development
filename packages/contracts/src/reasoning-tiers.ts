/**
 * How hard an agent thinks, and what that costs.
 *
 * A tier is not a label on a slider. It changes the model the run uses, how
 * much of a fetched response the model is allowed to read, how many evidence
 * points it returns, and how long it may take. Every run records the tier it
 * used alongside its real token counts, latency and cost, so the trade-off is
 * measured after the fact rather than asserted beforehand.
 */

export const REASONING_TIERS = ["fast", "balanced", "deep"] as const;
export type ReasoningTier = (typeof REASONING_TIERS)[number];

/** Runs pick a model by class, so the tier table survives a model change. */
export type ModelClass = "small" | "large";

export type TierSpec = {
  label: string;
  modelClass: ModelClass;
  /** Characters of a fetched body this tier may read. Deeper tiers see more of
   *  a long response, which is what lets them screen a list rather than its
   *  first few entries. */
  bodyChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
  evidencePoints: { min: number; max: number };
};

export const TIER_SPECS: Record<ReasoningTier, TierSpec> = {
  fast: {
    label: "Fast",
    modelClass: "small",
    bodyChars: 8_000,
    maxOutputTokens: 1_200,
    timeoutMs: 35_000,
    evidencePoints: { min: 2, max: 3 },
  },
  balanced: {
    label: "Balanced",
    modelClass: "large",
    bodyChars: 24_000,
    maxOutputTokens: 2_400,
    timeoutMs: 55_000,
    evidencePoints: { min: 3, max: 4 },
  },
  deep: {
    label: "Deep",
    modelClass: "large",
    bodyChars: 60_000,
    maxOutputTokens: 4_000,
    timeoutMs: 90_000,
    evidencePoints: { min: 4, max: 6 },
  },
};

export const DEFAULT_TIER: ReasoningTier = "balanced";

export function isReasoningTier(value: unknown): value is ReasoningTier {
  return typeof value === "string" && (REASONING_TIERS as readonly string[]).includes(value);
}

/** An unknown or absent tier resolves to the default rather than failing. */
export function resolveTier(value: unknown): ReasoningTier {
  return isReasoningTier(value) ? value : DEFAULT_TIER;
}

export function specFor(value: unknown): TierSpec {
  return TIER_SPECS[resolveTier(value)];
}

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

/** Price per million tokens, in cents. */
export type ModelPricing = {
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
};

/**
 * Cost is derived from the tokens a run actually used, not estimated from its
 * tier. It is kept in fractional cents: rounding a sub-cent run up to a whole
 * one makes a cheap tier look identical to an expensive one.
 */
export function costCents(pricing: ModelPricing, usage: TokenUsage): number {
  const input = Math.max(0, usage.inputTokens) * pricing.inputCentsPerMillion;
  const output = Math.max(0, usage.outputTokens) * pricing.outputCentsPerMillion;
  return Math.round(((input + output) / 1_000_000) * 10_000) / 10_000;
}

/** Tiers are ordered: each reads more, thinks longer, and costs more. */
export function tierRank(tier: ReasoningTier): number {
  return REASONING_TIERS.indexOf(tier);
}
