/**
 * How an agent definition evolves while it is being designed in conversation.
 *
 * Each turn returns a reply plus the definition as it now stands. A turn only
 * restates what changed, which creates two rules that have to hold or the
 * design silently drifts:
 *
 *   carry-forward   — a field the turn omits keeps the value already agreed.
 *                     Without this, an omitted field falls back to a default
 *                     and a token agent quietly becomes a wallet agent.
 *   target reset    — changing the target invalidates the sources and rules
 *                     that belonged to the old one, so those are re-derived
 *                     rather than carried across.
 */

import type { AgentRule, TargetKind } from "./agent-definition.ts";
import type { ReasoningMode } from "./reasoning-policy.ts";
import { reconcileSources, type SourceName } from "./source-catalog.ts";

export type ConversationRole = "user" | "assistant";

export type ConversationTurn = {
  role: ConversationRole;
  content: string;
};

export type UnsupportedNeed = {
  capabilityId: string;
  reason: string;
};

export type DraftDefinition = {
  name: string;
  objective: string;
  targetKind: TargetKind;
  sources: SourceName[];
  rules: AgentRule[];
  reasoningMode: ReasoningMode;
  unsupportedNeeds: UnsupportedNeed[];
};

/** Fields a single turn may restate. Anything absent is carried forward. */
export type DraftPatch = Partial<DraftDefinition>;

export const MAX_CONVERSATION_TURNS = 16;

export function trimConversation(turns: readonly ConversationTurn[]): ConversationTurn[] {
  return turns
    .filter((turn) => typeof turn?.content === "string" && turn.content.trim().length > 0)
    .slice(-MAX_CONVERSATION_TURNS);
}

export function hasUserTurn(turns: readonly ConversationTurn[]): boolean {
  return turns.some((turn) => turn.role === "user");
}

const EMPTY_DRAFT: DraftDefinition = {
  name: "Untitled agent",
  objective: "",
  targetKind: "wallet",
  sources: ["Wallet activity"],
  rules: [],
  reasoningMode: "rules_only",
  unsupportedNeeds: [],
};

export function applyTurn(current: DraftDefinition | null, patch: DraftPatch): DraftDefinition {
  const base = current ?? EMPTY_DRAFT;
  const targetKind = patch.targetKind ?? base.targetKind;
  const targetChanged = Boolean(patch.targetKind) && patch.targetKind !== base.targetKind;

  // Sources and rules belong to a target, so a target change discards them
  // unless this same turn supplied replacements.
  const sources = patch.sources ?? (targetChanged ? [] : base.sources);
  const rules = patch.rules ?? (targetChanged ? [] : base.rules);

  return {
    name: patch.name ?? base.name,
    objective: patch.objective ?? base.objective,
    targetKind,
    sources: reconcileSources(sources, targetKind),
    rules,
    reasoningMode: patch.reasoningMode ?? base.reasoningMode,
    unsupportedNeeds: patch.unsupportedNeeds ?? base.unsupportedNeeds,
  };
}

/**
 * A draft is ready to test once it describes something concrete. A target
 * address is deliberately NOT required — it is supplied at test time, so
 * demanding one mid-conversation stalls a design that is otherwise complete.
 */
export function isReadyToTest(draft: DraftDefinition | null): boolean {
  if (!draft) return false;
  if (draft.objective.trim().length < 12) return false;
  if (draft.sources.length === 0) return false;
  return draft.rules.length > 0 || draft.reasoningMode === "model_assisted";
}
