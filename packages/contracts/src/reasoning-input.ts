/**
 * What a model is allowed to see before it reasons, and what it must be told.
 *
 * `reasoning-tiers` sets how many characters of a response each tier may read.
 * This contract is about applying that budget honestly, which turns out to
 * matter more than the number itself.
 *
 * The failure worth naming, because it happened: a model handed the first
 * twelve thousand characters of a seventy-thousand-character feed will reason
 * about a partial list as though it were the whole one. It does not hesitate.
 * It reports that nothing unusual is happening in a feed it saw a fifth of, and
 * the answer looks exactly as confident as a correct one. A thirty-item feed
 * came back as one usable entry that way.
 *
 * So truncation is never silent. If a response was cut, the observation says
 * so, and the flag survives every later trim — a shortened view of an already
 * shortened response is not somehow complete again.
 *
 * The second rule is about direction. Trimming and redaction happen before the
 * call, not after it. Evidence can be cleaned up on the way out, but a secret
 * removed after the request has already left has not been removed from
 * anything.
 */

export type ObservedBody = {
  body: string;
  /** Whether what is held here is already less than what the source returned. */
  truncated: boolean;
};

export type ReasoningInput = {
  observation: ObservedBody | null;
  /** The runtime's own clock, supplied as ground truth on every call. */
  now: string;
};

/**
 * Trims a response to what this tier may read.
 *
 * Returns the flag as well as the text, because the caller has no other way to
 * know it happened — the shortened body looks perfectly well-formed.
 */
export function applyBudget(observation: ObservedBody, budgetChars: number): ObservedBody {
  const limit = Math.max(0, Math.floor(budgetChars));
  const body = observation.body.slice(0, limit);
  return {
    body,
    // Once true, always true. Trimming an already-trimmed response cannot make
    // it whole, and clearing the flag here would hide the first cut.
    truncated: observation.truncated || body.length < observation.body.length,
  };
}

/**
 * Whether the model is being told the truth about what it is looking at.
 *
 * A run whose input was cut without saying so is not evidence of anything,
 * because the conclusion was drawn from a list the model believed was complete.
 */
export function declaresTruncation(original: ObservedBody, presented: ObservedBody): boolean {
  const wasCut = presented.body.length < original.body.length || original.truncated;
  return wasCut ? presented.truncated : true;
}

/**
 * Whether an input is safe to send.
 *
 * Redaction happens on the way in. A secret stripped from evidence after the
 * request has already reached the provider has not been stripped from
 * anything — the copy that mattered is already gone.
 */
export function isSafeToSend(input: ReasoningInput, secrets: readonly string[]): boolean {
  if (!input.observation) return true;
  return !secrets.some((secret) => secret.length >= 8 && input.observation!.body.includes(secret));
}

/**
 * Whether the call carries the runtime clock.
 *
 * A model's sense of "now" is fixed at its training cutoff, so without this it
 * will read a current timestamp as the future and call a healthy run stale.
 * See `observation-freshness` for what is done with the clock once supplied.
 */
export function carriesClock(input: ReasoningInput): boolean {
  if (typeof input.now !== "string" || !input.now) return false;
  const parsed = Date.parse(input.now);
  return Number.isFinite(parsed);
}

/** Everything that has to hold before a reasoning call is made. */
export function isWellFormed(input: ReasoningInput, secrets: readonly string[] = []): boolean {
  return carriesClock(input) && isSafeToSend(input, secrets);
}
