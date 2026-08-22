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
  {
    id: "seed_holder_concentration",
    name: "Holder concentration warning",
    category: "Security",
    agentType: "MONITOR",
    summary: "Warn when the largest token account exceeds your limit.",
    objective: "Read this SPL token mint and alert me when the largest token account holds more than 10% of the current supply.",
    inputs: ["Token mint", "Largest account", "Supply"],
    sources: ["Token data", "Holder data"],
    targetKind: "token",
    rules: [{ id: "rule_high_holder", metric: "largest_holder_percent", operator: "gt", value: 10 }],
  },
  {
    id: "seed_token_activity",
    name: "Token activity alert",
    category: "Signals",
    agentType: "MONITOR",
    summary: "Detect new confirmed activity involving a token mint.",
    objective: "Read this SPL token mint and alert me when new confirmed transactions appear since the previous run.",
    inputs: ["Token mint", "Signatures", "Slot"],
    sources: ["Wallet activity", "Token data"],
    targetKind: "token",
    rules: [{ id: "rule_token_activity", metric: "new_transactions", operator: "gt", value: 0 }],
  },
  {
    id: "seed_token_supply_threshold",
    name: "Token supply threshold",
    category: "Signals",
    agentType: "MONITOR",
    summary: "Match when an SPL token supply crosses a chosen threshold.",
    objective: "Read this SPL token mint and alert me when its current supply is greater than 1,000,000 tokens.",
    inputs: ["Token mint", "Supply", "Decimals"],
    sources: ["Token data"],
    targetKind: "token",
    rules: [{ id: "rule_supply", metric: "token_supply", operator: "gt", value: 1000000 }],
  },
  {
    id: "seed_funding_received",
    name: "Wallet funding alert",
    category: "Wallets",
    agentType: "MONITOR",
    summary: "Alert when a wallet holds at or above a chosen SOL balance.",
    objective: "Read this wallet's confirmed SOL balance and alert me when it reaches 10 SOL or more.",
    inputs: ["Wallet", "Balance", "Threshold"],
    sources: ["Wallet activity"],
    targetKind: "wallet",
    rules: [{ id: "rule_funded", metric: "sol_balance", operator: "gte", value: 10 }],
  },
  {
    id: "seed_fee_balance_guard",
    name: "Fee balance guard",
    category: "Automation",
    agentType: "FILTER",
    summary: "Confirm a wallet can still cover Solana transaction fees.",
    objective: "Read this wallet's confirmed SOL balance and match only while it holds at least 0.05 SOL to cover transaction fees.",
    inputs: ["Wallet", "Balance", "Threshold"],
    sources: ["Wallet activity"],
    targetKind: "wallet",
    rules: [{ id: "rule_fee_floor", metric: "sol_balance", operator: "gte", value: 0.05 }],
  },
  {
    id: "seed_mint_authority_warning",
    name: "Mint authority warning",
    category: "Security",
    agentType: "MONITOR",
    summary: "Alert when a token mint can still issue new supply.",
    objective: "Check this SPL token mint and alert me whenever its mint authority is still enabled.",
    inputs: ["Token mint", "Mint authority"],
    sources: ["Token data"],
    targetKind: "token",
    rules: [{ id: "rule_mint_open", metric: "mint_authority_enabled", operator: "eq", value: true }],
  },
  {
    id: "seed_freeze_authority_warning",
    name: "Freeze authority warning",
    category: "Security",
    agentType: "MONITOR",
    summary: "Alert when a token mint can still freeze holder accounts.",
    objective: "Check this SPL token mint and alert me whenever its freeze authority is still enabled.",
    inputs: ["Token mint", "Freeze authority"],
    sources: ["Token data"],
    targetKind: "token",
    rules: [{ id: "rule_freeze_open", metric: "freeze_authority_enabled", operator: "eq", value: true }],
  },
];
