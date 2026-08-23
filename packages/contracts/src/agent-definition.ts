import { isReadableEndpoint } from "./endpoint-target.ts";

export const AGENT_MODES = ["alert", "approval", "automatic"] as const;
export const TARGET_KINDS = ["wallet", "token", "endpoint"] as const;
export const SCHEDULES = ["Manual", "Every 5 minutes", "Hourly", "Daily"] as const;

export type AgentMode = (typeof AGENT_MODES)[number];
export type TargetKind = (typeof TARGET_KINDS)[number];
export type AgentSchedule = (typeof SCHEDULES)[number];
export type RuleOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
export type RuleMetric =
  | "new_transactions"
  | "sol_balance"
  | "largest_holder_percent"
  | "token_supply"
  | "mint_authority_enabled"
  | "freeze_authority_enabled"
  | "http_status"
  | "response_time_ms"
  | "content_length"
  | "content_changed";

export type AgentRule = {
  id: string;
  metric: RuleMetric;
  operator: RuleOperator;
  value: number | boolean;
};

export type AgentDefinition = {
  name: string;
  objective: string;
  mode: AgentMode;
  schedule: AgentSchedule;
  targetKind: TargetKind;
  targetAddress: string;
  spendLimitCents: number;
  sources: string[];
  rules: AgentRule[];
};

export type ValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export type DefinitionValidation =
  | { ok: true; data: AgentDefinition; issues: [] }
  | { ok: false; data: null; issues: ValidationIssue[] };

const OPERATORS = new Set<RuleOperator>(["gt", "gte", "lt", "lte", "eq", "neq"]);
const WALLET_METRICS = new Set<RuleMetric>(["new_transactions", "sol_balance"]);
const ENDPOINT_METRICS = new Set<RuleMetric>([
  "http_status",
  "response_time_ms",
  "content_length",
  "content_changed",
]);
const TOKEN_METRICS = new Set<RuleMetric>([
  "new_transactions",
  "largest_holder_percent",
  "token_supply",
  "mint_authority_enabled",
  "freeze_authority_enabled",
]);
const BOOLEAN_METRICS = new Set<RuleMetric>([
  "mint_authority_enabled",
  "freeze_authority_enabled",
  "content_changed",
]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_VALUES = new Map(
  [...BASE58_ALPHABET].map((character, index) => [character, index]),
);

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodedBase58Length(value: string): number | null {
  const bytes = [0];

  for (const character of value) {
    const digit = BASE58_VALUES.get(character);
    if (digit === undefined) return null;

    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index]! * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeroes = 0;
  while (value[leadingZeroes] === "1") leadingZeroes += 1;

  const payloadLength = bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length;
  return leadingZeroes + payloadLength;
}

export function isSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  return decodedBase58Length(value) === 32;
}

function normalizeSources(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 80)).filter(Boolean))].slice(0, 12);
}

function normalizeRules(
  value: unknown,
  targetKind: TargetKind,
  issues: ValidationIssue[],
): AgentRule[] {
  if (!Array.isArray(value)) return [];
  const permitted = targetKind === "endpoint" ? ENDPOINT_METRICS : targetKind === "wallet" ? WALLET_METRICS : TOKEN_METRICS;

  return value.slice(0, 8).flatMap((raw, index) => {
    if (!isRecord(raw)) {
      issues.push({ field: `rules.${index}`, code: "invalid_rule", message: "Rule must be an object." });
      return [];
    }

    const metric = text(raw.metric, 50) as RuleMetric;
    const operator = text(raw.operator, 8) as RuleOperator;
    if (!permitted.has(metric) || !OPERATORS.has(operator)) {
      issues.push({
        field: `rules.${index}`,
        code: "unsupported_rule",
        message: "Rule metric or operator is not supported for this target.",
      });
      return [];
    }

    const booleanMetric = BOOLEAN_METRICS.has(metric);
    const parsedValue = booleanMetric ? raw.value : Number(raw.value);
    if (
      (booleanMetric && typeof parsedValue !== "boolean") ||
      (!booleanMetric && !Number.isFinite(parsedValue)) ||
      (booleanMetric && operator !== "eq" && operator !== "neq")
    ) {
      issues.push({ field: `rules.${index}.value`, code: "invalid_value", message: "Rule value is invalid." });
      return [];
    }

    return [{
      id: text(raw.id, 64) || `rule_${index + 1}`,
      metric,
      operator,
      value: parsedValue as number | boolean,
    }];
  });
}

export function validateAgentDefinition(input: unknown): DefinitionValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      data: null,
      issues: [{ field: "definition", code: "invalid_type", message: "Definition must be an object." }],
    };
  }

  const issues: ValidationIssue[] = [];
  const name = text(input.name, 64);
  const objective = text(input.objective, 500);
  const mode = text(input.mode, 16) as AgentMode;
  const schedule = text(input.schedule, 32) as AgentSchedule;
  const targetKind = text(input.targetKind, 16) as TargetKind;
  const targetKindForAddress = TARGET_KINDS.includes(targetKind) ? targetKind : "wallet";
  const targetAddress = text(input.targetAddress, targetKindForAddress === "endpoint" ? 400 : 64);
  const spendLimitCents = Number(input.spendLimitCents ?? 0);
  const sources = normalizeSources(input.sources);

  if (name.length < 2) issues.push({ field: "name", code: "too_short", message: "Name must contain at least two characters." });
  if (objective.length < 12) issues.push({ field: "objective", code: "too_short", message: "Objective must describe a concrete outcome." });
  if (!AGENT_MODES.includes(mode)) issues.push({ field: "mode", code: "invalid_mode", message: "Agent mode is not supported." });
  if (!SCHEDULES.includes(schedule)) issues.push({ field: "schedule", code: "invalid_schedule", message: "Schedule is not supported." });
  if (!TARGET_KINDS.includes(targetKind)) issues.push({ field: "targetKind", code: "invalid_target", message: "Target must be a wallet, token or endpoint." });
  // An endpoint target is a URL, held to the endpoint policy instead.
  const addressValid = targetKindForAddress === "endpoint"
    ? isReadableEndpoint(targetAddress)
    : isSolanaAddress(targetAddress);
  if (!addressValid) {
    issues.push({
      field: "targetAddress",
      code: "invalid_address",
      message: targetKindForAddress === "endpoint"
        ? "A readable public https endpoint is required."
        : "A valid Solana address is required.",
    });
  }
  if (!Number.isSafeInteger(spendLimitCents) || spendLimitCents < 0 || spendLimitCents > 1_000_000) {
    issues.push({ field: "spendLimitCents", code: "invalid_limit", message: "Spend limit must be an integer between 0 and 1,000,000 cents." });
  }
  if (sources.length === 0) issues.push({ field: "sources", code: "missing_source", message: "At least one source is required." });

  const rules = normalizeRules(input.rules, targetKindForAddress, issues);
  if (mode === "automatic" && rules.length === 0) {
    issues.push({ field: "rules", code: "missing_guard", message: "Automatic agents require at least one deterministic rule." });
  }

  if (issues.length > 0) return { ok: false, data: null, issues };

  return {
    ok: true,
    data: { name, objective, mode, schedule, targetKind, targetAddress, spendLimitCents, sources, rules },
    issues: [],
  };
}
