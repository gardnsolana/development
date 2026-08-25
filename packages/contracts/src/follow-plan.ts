/**
 * The second step of an agent: what it follows out of its first read, and the
 * rules that keep doing so safe and bounded.
 *
 * Two properties matter more than the rest.
 *
 * Everything followed came from content a third party served. A screener
 * response is not trusted input, so every extracted value is validated for the
 * kind it claims to be before anything fetches it — and a value that looks like
 * a URL goes through exactly the same policy a target URL does. A response
 * cannot smuggle an internal address into something the agent will then read.
 *
 * And a fan-out is bounded. A run has to stay predictable in time and cost, so
 * the number followed is capped regardless of what a plan asks for.
 */

import { checkEndpointTarget } from "./endpoint-target.ts";
import { extractPath, reachesList } from "./follow-path.ts";
import { isSolanaAddress, type TargetKind } from "./agent-definition.ts";

export type FollowUp = {
  path: string;
  /** What each extracted value is, and therefore how it is validated and read. */
  targetKind: TargetKind;
  limit: number;
};

export const FOLLOW_LIMITS = {
  /** Hard ceiling, applied whatever a plan requests. */
  max: 10,
  default: 5,
  min: 1,
} as const;

export function clampFollowLimit(limit: unknown): number {
  const parsed = typeof limit === "number" ? limit : Number.parseInt(String(limit ?? ""), 10);
  if (!Number.isFinite(parsed)) return FOLLOW_LIMITS.default;
  return Math.min(FOLLOW_LIMITS.max, Math.max(FOLLOW_LIMITS.min, Math.trunc(parsed)));
}

export function cleanFollowUp(value: unknown): FollowUp | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const path = typeof raw.path === "string" ? raw.path.trim().slice(0, 200) : "";
  if (!path) return null;

  const targetKind: TargetKind = raw.targetKind === "wallet" || raw.targetKind === "endpoint" || raw.targetKind === "token"
    ? raw.targetKind
    : "token";

  return { path, targetKind, limit: clampFollowLimit(raw.limit) };
}

/**
 * A follow-up reads a path out of the first response, and only an endpoint read
 * produces a payload to path into. So a plan carrying a follow-up is an
 * endpoint agent, whatever the follow-up itself points at. Getting this wrong
 * makes an agent meant to screen a feed ask for a single address instead.
 */
export function primaryTargetFor(followUp: FollowUp | null, requested: TargetKind): TargetKind {
  return followUp ? "endpoint" : requested;
}

export function isCoherent(followUp: FollowUp | null, primary: TargetKind): boolean {
  if (!followUp) return true;
  return primary === "endpoint" && reachesList(followUp.path);
}

/** Values are checked for the kind they claim to be before anything is fetched. */
export function usableFollowValue(value: string, targetKind: TargetKind): boolean {
  if (targetKind === "endpoint") return checkEndpointTarget(value).ok;
  return isSolanaAddress(value);
}

/**
 * The list a run will actually follow: extracted, validated, de-duplicated and
 * capped, in the order it appeared.
 */
export function selectFollowTargets(payload: unknown, followUp: FollowUp): string[] {
  const ceiling = Math.min(followUp.limit, FOLLOW_LIMITS.max);
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const value of extractPath(payload, followUp.path)) {
    if (kept.length >= ceiling) break;
    if (seen.has(value)) continue;
    seen.add(value);
    if (!usableFollowValue(value, followUp.targetKind)) continue;
    kept.push(value);
  }

  return kept;
}

export type FollowedRead = {
  value: string;
  targetKind: TargetKind;
  ok: boolean;
  error: string | null;
};

/**
 * Every target attempted appears in the result, marked ok or not. A follow that
 * fails is recorded rather than thrown: one dead target should not lose a run,
 * and a gap in the picture has to be visible rather than silent.
 */
export function summariseFollowed(reads: readonly FollowedRead[]) {
  const failed = reads.filter((read) => !read.ok);
  return {
    attempted: reads.length,
    succeeded: reads.length - failed.length,
    failed: failed.length,
    /** True when nothing came back at all, which is a broken step, not a finding. */
    allFailed: reads.length > 0 && failed.length === reads.length,
  };
}
