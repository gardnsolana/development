import {
  type AgentDefinition,
  type AgentRule,
  type DefinitionValidation,
  type TargetKind,
  type ValidationIssue,
  validateAgentDefinition,
} from "./agent-definition.ts";

export const SEED_CATEGORIES = ["Wallets", "Security", "Automation", "Signals"] as const;
export const SEED_AGENT_TYPES = ["MONITOR", "FILTER"] as const;

export type SeedCategory = (typeof SEED_CATEGORIES)[number];
export type SeedAgentType = (typeof SEED_AGENT_TYPES)[number];

export type StarterSeed = {
  id: string;
  name: string;
  category: SeedCategory;
  agentType: SeedAgentType;
  summary: string;
  objective: string;
  inputs: string[];
  sources: string[];
  targetKind: TargetKind;
  rules: AgentRule[];
};

export type CatalogValidation =
  | { ok: true; issues: [] }
  | { ok: false; issues: ValidationIssue[] };

// Well-formed placeholder targets used to prove every seed composes into a
// deployable definition. Planting always substitutes the user's real target.
const PROOF_TARGETS: Record<TargetKind, string> = {
  wallet: "11111111111111111111111111111111",
  token: "So11111111111111111111111111111111111111112",
};

export function seedToDefinition(seed: StarterSeed, targetAddress: string): AgentDefinition {
  return {
    name: seed.name,
    objective: seed.objective,
    mode: "alert",
    schedule: "Manual",
    targetKind: seed.targetKind,
    targetAddress,
    spendLimitCents: 0,
    sources: seed.sources,
    rules: seed.rules,
  };
}

export function plantSeed(seed: StarterSeed, targetAddress: string): DefinitionValidation {
  return validateAgentDefinition(seedToDefinition(seed, targetAddress));
}

export function validateSeedCatalog(seeds: readonly StarterSeed[]): CatalogValidation {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  seeds.forEach((seed, index) => {
    const field = `seeds.${index}`;

    if (seenIds.has(seed.id)) {
      issues.push({ field, code: "duplicate_id", message: `Seed id "${seed.id}" is already registered.` });
    }
    seenIds.add(seed.id);

    if (seenNames.has(seed.name)) {
      issues.push({ field, code: "duplicate_name", message: `Seed name "${seed.name}" is already registered.` });
    }
    seenNames.add(seed.name);

    if (!SEED_CATEGORIES.includes(seed.category)) {
      issues.push({ field, code: "invalid_category", message: "Seed category is not supported." });
    }
    if (!SEED_AGENT_TYPES.includes(seed.agentType)) {
      issues.push({ field, code: "invalid_agent_type", message: "Seed agent type is not supported." });
    }
    if (seed.summary.trim().length < 12) {
      issues.push({ field, code: "missing_summary", message: "Seed summary must describe the outcome." });
    }
    if (seed.inputs.length === 0) {
      issues.push({ field, code: "missing_inputs", message: "Seed must declare the inputs it reads." });
    }
    if (seed.rules.length === 0) {
      issues.push({ field, code: "missing_rules", message: "Seed must carry at least one measurable rule." });
    }

    const planted = plantSeed(seed, PROOF_TARGETS[seed.targetKind] ?? PROOF_TARGETS.wallet);
    if (!planted.ok) {
      for (const issue of planted.issues) {
        issues.push({ field: `${field}.${issue.field}`, code: issue.code, message: issue.message });
      }
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [] };
}

// The live starter catalog. Every entry is a full working configuration —
// job, live inputs, measurable rules and target — not interface copy.
export const STARTER_SEEDS: readonly StarterSeed[] = [
  {
    id: "seed_wallet_activity",
    name: "Wallet activity alert",
    category: "Wallets",
    agentType: "MONITOR",
    summary: "Alert when a wallet records new confirmed transactions.",
    objective: "Read this wallet on Solana. Alert me when it has one or more new confirmed transactions since the previous run.",
    inputs: ["Wallet", "Signatures", "Slot"],
    sources: ["Wallet activity"],
    targetKind: "wallet",
    rules: [{ id: "rule_new_activity", metric: "new_transactions", operator: "gt", value: 0 }],
  },
  {
    id: "seed_low_sol_balance",
    name: "Low SOL balance alert",
    category: "Wallets",
    agentType: "MONITOR",
    summary: "Warn when a wallet falls below a chosen SOL balance.",
    objective: "Read this wallet's confirmed SOL balance and alert me when it falls below 1 SOL.",
    inputs: ["Wallet", "Balance", "Threshold"],
    sources: ["Wallet activity"],
    targetKind: "wallet",
    rules: [{ id: "rule_low_balance", metric: "sol_balance", operator: "lt", value: 1 }],
  },
  {
    id: "seed_token_authority_safety",
    name: "Token authority safety check",
    category: "Security",
    agentType: "FILTER",
    summary: "Check holder concentration, mint authority and freeze authority.",
    objective: "Check this SPL token mint and match only when the largest holder is below 10% and both mint and freeze authorities are disabled.",
    inputs: ["Token mint", "Authorities", "Holders"],
    sources: ["Token data", "Holder data"],
    targetKind: "token",
    rules: [
      { id: "rule_holder_limit", metric: "largest_holder_percent", operator: "lt", value: 10 },
      { id: "rule_mint_disabled", metric: "mint_authority_enabled", operator: "eq", value: false },
      { id: "rule_freeze_disabled", metric: "freeze_authority_enabled", operator: "eq", value: false },
    ],
  },
];
