import type { EvaluationSummary, RuleCheck } from "./rule-evaluation.ts";

// Every run records inspectable evidence: which rules were checked against which
// confirmed values, at which slot, from which read-only sources. This is what makes
// a match provable after the fact rather than a claim.

export type SourceStatus = {
  source: string;
  status: "ready" | "unsupported" | "unconfigured";
  detail: string;
};

export type EvidenceInput = {
  evaluation: EvaluationSummary;
  sourceStatuses: SourceStatus[];
  rpcSlot: number | null;
  observedAt: string;
};

export type EvidenceRecord = {
  matched: boolean;
  executionMode: "live-readonly";
  cluster: "mainnet-beta";
  rpcSlot: number | null;
  observedAt: string;
  readySources: number;
  checks: RuleCheck[];
  unavailable: RuleCheck["metric"][];
  sourceStatuses: SourceStatus[];
  summary: string;
};

function summarize(evaluation: EvaluationSummary): string {
  const { checks, matched, evaluated } = evaluation;
  if (evaluated === 0) return "No deterministic rules were configured for this run.";
  const unavailable = checks.filter((check) => !check.available);
  if (unavailable.length > 0) {
    return `Runtime data was unavailable for: ${unavailable.map((check) => check.metric).join(", ")}.`;
  }
  if (matched) {
    return `All ${evaluated} rule${evaluated === 1 ? "" : "s"} matched confirmed Solana data.`;
  }
  const failed = checks.filter((check) => !check.passed);
  return `${failed.length} of ${evaluated} rule${evaluated === 1 ? "" : "s"} did not match confirmed Solana data.`;
}

export function buildEvidence(input: EvidenceInput): EvidenceRecord {
  if (!Number.isFinite(Date.parse(input.observedAt))) {
    throw new TypeError("observedAt must be a valid ISO timestamp.");
  }
  if (input.rpcSlot !== null && (!Number.isSafeInteger(input.rpcSlot) || input.rpcSlot < 0)) {
    throw new RangeError("rpcSlot must be a non-negative integer or null.");
  }
  return {
    matched: input.evaluation.matched,
    executionMode: "live-readonly",
    cluster: "mainnet-beta",
    rpcSlot: input.rpcSlot,
    observedAt: input.observedAt,
    readySources: input.sourceStatuses.filter((source) => source.status === "ready").length,
    checks: input.evaluation.checks,
    unavailable: input.evaluation.unavailable,
    sourceStatuses: input.sourceStatuses,
    summary: summarize(input.evaluation),
  };
}
