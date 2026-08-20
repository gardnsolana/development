import type { AgentSchedule } from "./agent-definition.ts";

// How long each schedule waits between confirmed runs. "Manual" agents never
// self-schedule; they run only when the owner triggers them.
export const CADENCE_SECONDS: Record<AgentSchedule, number | null> = {
  Manual: null,
  "Every 5 minutes": 5 * 60,
  Hourly: 60 * 60,
  Daily: 24 * 60 * 60,
};

export function isScheduled(schedule: AgentSchedule): boolean {
  return CADENCE_SECONDS[schedule] !== null;
}

// Returns the next confirmed-run time as an ISO string, or null for Manual.
// Deterministic: the caller supplies `from`, so there is no hidden clock.
export function nextRunAt(schedule: AgentSchedule, from: Date): string | null {
  const cadence = CADENCE_SECONDS[schedule];
  if (cadence === null) return null;
  const fromMs = from.getTime();
  if (!Number.isFinite(fromMs)) throw new TypeError("`from` must be a valid Date.");
  return new Date(fromMs + cadence * 1_000).toISOString();
}

// True when a scheduled agent is due: it has a cadence and its nextRunAt has passed.
export function isDue(nextRunAtIso: string | null, now: Date): boolean {
  if (!nextRunAtIso) return false;
  const due = Date.parse(nextRunAtIso);
  if (!Number.isFinite(due)) return false;
  return due <= now.getTime();
}
