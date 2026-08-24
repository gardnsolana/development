/**
 * When a model returns a structured result, deciding whether that result can
 * be trusted at all.
 *
 * The failure worth naming: a response that runs out of output tokens midway
 * is still well-formed enough to parse, but the fields written last are simply
 * absent. Nothing errors. The caller reads a result that looks complete and
 * quietly isn't — a findings list that came back empty, a decision missing its
 * severity. A truncated structured result must be rejected, never used.
 *
 * And it must not be retried unchanged: the same request against the same
 * ceiling produces the same truncation, so a retry burns time and money to
 * fail identically.
 */

export type StopReason = "end_turn" | "max_tokens" | "refusal" | "stop_sequence" | "tool_use" | string;

export type ToolResponse = {
  stopReason: StopReason;
  /** Whether a tool-use block with parseable input came back at all. */
  hasToolInput: boolean;
};

export type RejectionCode =
  | "truncated"
  | "refused"
  | "missing_tool_input";

export type OutputVerdict =
  | { ok: true }
  | { ok: false; code: RejectionCode; retryable: boolean; message: string };

const REJECTIONS: Record<RejectionCode, { retryable: boolean; message: string }> = {
  truncated: {
    // Retrying against an unchanged ceiling fails the same way.
    retryable: false,
    message: "The answer was cut off before it finished. Ask for something narrower, or raise the output budget.",
  },
  refused: {
    retryable: false,
    message: "The model declined this request. Rewrite it as a safe monitoring or analysis task.",
  },
  missing_tool_input: {
    // A malformed or absent block is usually transient.
    retryable: true,
    message: "The model returned no usable structured result. Try the request again.",
  },
};

function reject(code: RejectionCode): OutputVerdict {
  return { ok: false, code, ...REJECTIONS[code] };
}

export function classifyToolResponse(response: ToolResponse): OutputVerdict {
  // Order matters: a refusal and a truncation both leave no usable input, and
  // reporting "try again" for either would be wrong.
  if (response.stopReason === "refusal") return reject("refused");
  if (response.stopReason === "max_tokens") return reject("truncated");
  if (!response.hasToolInput) return reject("missing_tool_input");
  return { ok: true };
}

export function isUsable(response: ToolResponse): boolean {
  return classifyToolResponse(response).ok;
}

/**
 * Array bounds belong in code, not in a tool schema: the tool-use API rejects
 * minItems and maxItems on array properties outright, and a schema carrying
 * them fails every call before it reaches the model. Bounds are therefore
 * declared here and applied to whatever comes back.
 */
export function boundedList<T>(value: unknown, max: number, clean: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const kept: T[] = [];
  for (const item of value) {
    if (kept.length >= max) break;
    const cleaned = clean(item);
    if (cleaned !== null) kept.push(cleaned);
  }
  return kept;
}
