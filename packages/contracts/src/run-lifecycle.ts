export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export type RunRecord = {
  id: string;
  definitionId: string;
  definitionRevision: number;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type CreateRunInput = {
  id: string;
  definitionId: string;
  definitionRevision: number;
  createdAt?: string;
};

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

function requireIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{3,96}$/.test(normalized)) {
    throw new TypeError(`${field} must be a stable identifier.`);
  }
  return normalized;
}

function requireTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError("Run timestamp must be valid ISO-compatible time.");
  }
  return value;
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function createRunRecord(input: CreateRunInput): RunRecord {
  if (!Number.isSafeInteger(input.definitionRevision) || input.definitionRevision < 1) {
    throw new TypeError("Definition revision must be a positive integer.");
  }

  return {
    id: requireIdentifier(input.id, "Run id"),
    definitionId: requireIdentifier(input.definitionId, "Definition id"),
    definitionRevision: input.definitionRevision,
    status: "queued",
    createdAt: requireTimestamp(input.createdAt ?? new Date().toISOString()),
    startedAt: null,
    completedAt: null,
  };
}

export function transitionRun(
  record: RunRecord,
  nextStatus: RunStatus,
  transitionedAt = new Date().toISOString(),
): RunRecord {
  if (!canTransitionRun(record.status, nextStatus)) {
    throw new Error(`Run cannot transition from ${record.status} to ${nextStatus}.`);
  }

  const timestamp = requireTimestamp(transitionedAt);
  if (Date.parse(timestamp) < Date.parse(record.createdAt)) {
    throw new Error("Run transition cannot predate creation.");
  }

  return {
    ...record,
    status: nextStatus,
    startedAt: nextStatus === "running" ? timestamp : record.startedAt,
    completedAt: isTerminalRunStatus(nextStatus) ? timestamp : null,
  };
}
