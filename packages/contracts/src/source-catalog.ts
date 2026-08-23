/**
 * Live inputs an agent may read, and which target each one belongs to.
 *
 * Sources are not interchangeable: an endpoint agent reads the web and never
 * the chain, and a wallet or token agent never reads the web. Offering a source
 * that cannot apply to the selected target is a UI that lies, so the catalogue
 * is scoped by target rather than filtered after the fact.
 */

import type { TargetKind } from "./agent-definition.ts";

export const SOURCE_NAMES = [
  "Wallet activity",
  "Token data",
  "Holder data",
  "Web endpoint",
] as const;

export type SourceName = (typeof SOURCE_NAMES)[number];

export const SOURCE_DESCRIPTIONS: Record<SourceName, string> = {
  "Wallet activity": "Confirmed signatures and balances",
  "Token data": "Mint supply and authorities",
  "Holder data": "Largest token-account concentration",
  "Web endpoint": "One public https URL, read with GET",
};

export const SOURCES_BY_TARGET: Record<TargetKind, SourceName[]> = {
  wallet: ["Wallet activity"],
  token: ["Wallet activity", "Token data", "Holder data"],
  endpoint: ["Web endpoint"],
};

export const DEFAULT_SOURCES_BY_TARGET: Record<TargetKind, SourceName[]> = {
  wallet: ["Wallet activity"],
  token: ["Token data", "Holder data"],
  endpoint: ["Web endpoint"],
};

export function isSourceName(value: unknown): value is SourceName {
  return typeof value === "string" && (SOURCE_NAMES as readonly string[]).includes(value);
}

export function selectableSources(targetKind: TargetKind): SourceName[] {
  return SOURCES_BY_TARGET[targetKind] ?? SOURCES_BY_TARGET.wallet;
}

export function isSourceAllowed(source: unknown, targetKind: TargetKind): boolean {
  return isSourceName(source) && selectableSources(targetKind).includes(source);
}

export function describeSource(source: SourceName): string {
  return SOURCE_DESCRIPTIONS[source];
}

/**
 * Keeps only the sources that belong to the target, falling back to that
 * target's defaults when nothing survives — a target is never left with none.
 */
export function reconcileSources(sources: unknown, targetKind: TargetKind): SourceName[] {
  const list = Array.isArray(sources) ? sources : [];
  const kept = [...new Set(list.filter((source) => isSourceAllowed(source, targetKind)))] as SourceName[];
  return kept.length ? kept : [...(DEFAULT_SOURCES_BY_TARGET[targetKind] ?? DEFAULT_SOURCES_BY_TARGET.wallet)];
}
