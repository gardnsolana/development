import type { AgentRule, RuleMetric, RuleOperator } from "./agent-definition.ts";

export type ObservationMetric = number | boolean | null;

export type ObservedMetrics = Partial<Record<RuleMetric, ObservationMetric>>;

export type RuleCheck = {
  ruleId: string;
  metric: RuleMetric;
  operator: RuleOperator;
  expected: number | boolean;
  actual: ObservationMetric;
  available: boolean;
  passed: boolean;
  display: string;
};

export type EvaluationSummary = {
  checks: RuleCheck[];
  evaluated: number;
  matched: boolean;
  unavailable: RuleMetric[];
};

const METRIC_LABELS: Record<RuleMetric, string> = {
  new_transactions: "New transactions",
  sol_balance: "SOL balance",
  largest_holder_percent: "Largest holder",
  mint_authority_enabled: "Mint authority enabled",
  freeze_authority_enabled: "Freeze authority enabled",
};

export function metricLabel(metric: RuleMetric): string {
  return METRIC_LABELS[metric];
}

export function formatMetric(metric: RuleMetric, value: ObservationMetric): string {
  if (value === null) return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (metric === "largest_holder_percent") return `${value.toFixed(2)}%`;
  if (metric === "sol_balance") return `${value.toLocaleString("en-US", { maximumFractionDigits: 5 })} SOL`;
  return value.toLocaleString("en-US");
}

function compare(actual: ObservationMetric, operator: RuleOperator, expected: number | boolean): boolean {
  if (actual === null) return false;
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  if (operator === "gt") return actual > expected;
  if (operator === "gte") return actual >= expected;
  if (operator === "lt") return actual < expected;
  return actual <= expected;
}

export function evaluateRule(rule: AgentRule, metrics: ObservedMetrics): RuleCheck {
  const actual = metrics[rule.metric] ?? null;
  const available = actual !== null;
  return {
    ruleId: rule.id,
    metric: rule.metric,
    operator: rule.operator,
    expected: rule.value,
    actual,
    available,
    passed: available && compare(actual, rule.operator, rule.value),
    display: formatMetric(rule.metric, actual),
  };
}

export function evaluateRules(rules: AgentRule[], metrics: ObservedMetrics): EvaluationSummary {
  const checks = rules.map((rule) => evaluateRule(rule, metrics));
  const unavailable = checks.filter((check) => !check.available).map((check) => check.metric);
  return {
    checks,
    evaluated: checks.length,
    matched: checks.length > 0 && checks.every((check) => check.passed),
    unavailable,
  };
}
