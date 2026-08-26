/**
 * Keeping a secret out of everything that gets stored, shown or shared.
 *
 * The reason this is its own contract: an evidence trail is not a log. It is
 * rendered in the product, screenshotted, and eventually sold alongside the
 * agent that produced it. A key that reaches one is a key published, and no
 * amount of care elsewhere undoes that.
 *
 * Two providers make this a live risk rather than a theoretical one — any that
 * takes its key in a query string, since the request URL is persisted, and any
 * that echoes the URL back inside an error message.
 */

/**
 * Below this length a value is not treated as a secret for redaction purposes.
 *
 * Blindly removing a short string shreds unrelated text: redacting "20" would
 * turn "volume is up 20%" into "volume is up [redacted]%". A key this short is
 * not a real key, so refusing to redact it is safer than corrupting output.
 */
export const MIN_REDACTABLE_LENGTH = 8;

export const REDACTION_MARKER = "[redacted]";

export function isRedactable(secret: string): boolean {
  return typeof secret === "string" && secret.length >= MIN_REDACTABLE_LENGTH;
}

/** Removes every occurrence of a secret from text about to be persisted or shown. */
export function redact(text: string, secret: string): string {
  if (!isRedactable(secret)) return text;
  return text.split(secret).join(REDACTION_MARKER);
}

/** Applies redaction for several credentials at once, longest first. */
export function redactAll(text: string, secrets: readonly string[]): string {
  return [...secrets]
    .filter(isRedactable)
    .sort((a, b) => b.length - a.length)
    .reduce((current, secret) => redact(current, secret), text);
}

export const HINT_VISIBLE_CHARACTERS = 4;

/**
 * What a person sees instead of their key: enough to tell two apart, never
 * enough to use one. A value too short to hint at is hidden entirely rather
 * than partly revealed.
 */
export function hint(secret: string): string {
  const trimmed = typeof secret === "string" ? secret.trim() : "";
  if (trimmed.length <= HINT_VISIBLE_CHARACTERS) return "••••";
  return `••••${trimmed.slice(-HINT_VISIBLE_CHARACTERS)}`;
}

/** A last check before something is written down: does it still contain a secret? */
export function containsSecret(text: string, secret: string): boolean {
  return isRedactable(secret) && text.includes(secret);
}
