/**
 * Reaching into a response to find the things worth following.
 *
 * A second step needs to know where, inside whatever the first read returned,
 * the identifiers live. That is expressed as a path: dots walk fields, and `[]`
 * steps into an array and keeps walking every element in it.
 *
 *   pairs[].baseToken.address
 *
 * reads a token address out of all thirty entries of a screener response. The
 * grammar is deliberately small — enough to reach a field in a list, and not
 * enough to be a query language.
 */

export const PATH_SEPARATOR = ".";
export const ARRAY_MARKER = "[]";

export type PathSegment = {
  key: string;
  /** True when this segment steps into an array and continues into each element. */
  intoArray: boolean;
};

export function parsePath(path: string): PathSegment[] {
  return path
    .split(PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const intoArray = segment.endsWith(ARRAY_MARKER);
      return { key: intoArray ? segment.slice(0, -ARRAY_MARKER.length) : segment, intoArray };
    });
}

function readKey(node: unknown, key: string): unknown {
  if (!key) return node;
  if (!node || typeof node !== "object") return undefined;
  return (node as Record<string, unknown>)[key];
}

/**
 * Values are returned as strings in the order they appeared. Anything that is
 * not a string or a finite number is skipped rather than coerced — an object
 * where an address was expected is a mistake, not a value.
 */
export function extractPath(payload: unknown, path: string): string[] {
  const segments = parsePath(path);
  if (segments.length === 0) return [];

  let current: unknown[] = [payload];

  for (const segment of segments) {
    const next: unknown[] = [];
    for (const node of current) {
      const value = readKey(node, segment.key);
      if (value === undefined || value === null) continue;
      if (segment.intoArray) {
        if (Array.isArray(value)) next.push(...value);
      } else {
        next.push(value);
      }
    }
    current = next;
    if (current.length === 0) return [];
  }

  return current.flatMap((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }
    if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
    return [];
  });
}

/** Whether a path could ever reach into a list, which a fan-out requires. */
export function reachesList(path: string): boolean {
  return parsePath(path).some((segment) => segment.intoArray);
}
