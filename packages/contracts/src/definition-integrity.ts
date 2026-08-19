import type { AgentDefinition } from "./agent-definition.ts";

// A published definition is content-addressed: it is serialized deterministically
// (keys sorted, no incidental whitespace) and hashed. Any change to the meaningful
// content changes the checksum, so a fork can be verified against what was listed.

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = canonicalize((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }
  return value;
}

export function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

// Only the fields that define behaviour are hashed. A target address is a private,
// per-user binding and is deliberately excluded so a listing's identity is stable
// across the many wallets or tokens different owners point the same definition at.
export function definitionFingerprint(definition: AgentDefinition): string {
  return canonicalString({
    name: definition.name,
    objective: definition.objective,
    mode: definition.mode,
    schedule: definition.schedule,
    targetKind: definition.targetKind,
    spendLimitCents: definition.spendLimitCents,
    sources: [...definition.sources].sort(),
    rules: definition.rules,
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function definitionChecksum(definition: AgentDefinition): Promise<string> {
  return sha256Hex(definitionFingerprint(definition));
}

export async function checksumMatches(definition: AgentDefinition, expected: string): Promise<boolean> {
  const actual = await definitionChecksum(definition);
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}
