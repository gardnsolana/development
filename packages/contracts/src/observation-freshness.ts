/**
 * Freshness is measured against the runtime clock, which is supplied as ground
 * truth on every reasoning call.
 *
 * A language model's sense of "now" is fixed at its training cutoff, so without
 * an explicit current time it will read a real observation timestamp as being
 * in the future and report a healthy run as stale or clock-broken. The current
 * time is therefore never inferred — it is passed in and treated as correct
 * even when it is later than anything the model has seen.
 */

export type FreshnessBand = "fresh" | "recent" | "aging" | "stale";

export type Freshness = {
  band: FreshnessBand;
  ageMs: number;
  /** True when the observation is timestamped after the supplied clock. */
  ahead: boolean;
};

export const FRESHNESS_THRESHOLDS_MS = {
  fresh: 60_000,
  recent: 15 * 60_000,
  aging: 60 * 60_000,
} as const;

/** Tolerates ordinary clock skew between the reader and the source. */
export const CLOCK_SKEW_TOLERANCE_MS = 5_000;

function parseInstant(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function measureFreshness(observedAt: unknown, currentTime: unknown): Freshness | null {
  const observed = parseInstant(observedAt);
  const now = parseInstant(currentTime);
  if (observed === null || now === null) return null;

  const ageMs = now - observed;
  // Slightly-ahead timestamps are skew, not evidence of anything.
  const ahead = ageMs < -CLOCK_SKEW_TOLERANCE_MS;
  const effectiveAge = Math.max(0, ageMs);

  const band: FreshnessBand = effectiveAge <= FRESHNESS_THRESHOLDS_MS.fresh
    ? "fresh"
    : effectiveAge <= FRESHNESS_THRESHOLDS_MS.recent
      ? "recent"
      : effectiveAge <= FRESHNESS_THRESHOLDS_MS.aging
        ? "aging"
        : "stale";

  return { band, ageMs, ahead };
}

/**
 * The clock statement given to the reasoning engine. It says plainly that the
 * supplied time is authoritative and being later than training data is normal,
 * so a current date is never itself treated as an anomaly.
 */
export function clockGroundTruth(currentTime: Date | string): string {
  const iso = typeof currentTime === "string" ? currentTime : currentTime.toISOString();
  return [
    `The current date and time is ${iso}.`,
    "This is authoritative ground truth from the runtime clock.",
    "It is later than your training data, which is expected and normal.",
    "Never treat the current date, or an observation timestamp at or near it, as evidence of stale data, a clock error, or an anomaly.",
    "Judge freshness only by comparing timestamps inside the observation against this current time.",
  ].join(" ");
}
