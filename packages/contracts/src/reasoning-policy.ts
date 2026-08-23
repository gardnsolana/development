/**
 * How a run's verdict is composed when GARDN Intelligence is involved.
 *
 * Two things are deliberately separated:
 *
 *   analysis — always produced, including when nothing matched, so a no-match
 *              carries an explanation rather than a bare failed rule.
 *   verdict  — hard rules are evaluated outside the model and gate the match.
 *              The model can withhold a match the rules allowed; it can never
 *              create one the rules refused.
 *
 * That asymmetry is the whole safety property: reading agent output can never
 * be talked into firing by anything the model was shown, and observations
 * include attacker-controllable text such as on-chain metadata and fetched
 * web pages.
 */

export type RunSeverity = "informational" | "worth_watching" | "act_now";

export type ReasoningMode = "rules_only" | "model_assisted";

export type ModelJudgement = {
  matched: boolean;
  severity: RunSeverity;
  confidence: "low" | "medium" | "high";
};

export type VerdictInput = {
  reasoningMode: ReasoningMode;
  /** Result of evaluating every hard rule outside the model. */
  hardRulesMatched: boolean;
  /** Absent when the agent is deterministic, or when reasoning did not run. */
  judgement?: ModelJudgement | null;
};

export type Verdict = {
  matched: boolean;
  /** True when the model was consulted and reached its own conclusion. */
  reasoned: boolean;
  /** True when the model withheld a match the hard rules would have allowed. */
  withheldByModel: boolean;
  severity: RunSeverity;
};

export const SEVERITY_ORDER: RunSeverity[] = ["informational", "worth_watching", "act_now"];

export function isRunSeverity(value: unknown): value is RunSeverity {
  return typeof value === "string" && (SEVERITY_ORDER as string[]).includes(value);
}

/** Reasoning runs on every model-assisted observation, match or not. */
export function shouldReason(reasoningMode: ReasoningMode): boolean {
  return reasoningMode === "model_assisted";
}

export function composeVerdict(input: VerdictInput): Verdict {
  const judgement = input.judgement ?? null;
  const reasoned = shouldReason(input.reasoningMode) && judgement !== null;

  // The model is only ever an additional gate, never an override.
  const matched = input.hardRulesMatched && (reasoned ? judgement!.matched : true);
  const withheldByModel = input.hardRulesMatched && reasoned && !judgement!.matched;
  const severity: RunSeverity = reasoned && isRunSeverity(judgement!.severity)
    ? judgement!.severity
    : "informational";

  return { matched, reasoned, withheldByModel, severity };
}

/**
 * Metrics a run read but no rule referenced. Surfacing these is what stops a
 * single-rule agent from reporting one line when it observed far more.
 */
export function unruledMetrics<Metric extends string>(
  observedMetrics: readonly Metric[],
  ruleMetrics: readonly Metric[],
): Metric[] {
  const ruled = new Set(ruleMetrics);
  return observedMetrics.filter((metric) => !ruled.has(metric));
}
