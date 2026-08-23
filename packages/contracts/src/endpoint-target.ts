/**
 * Endpoint targets let an agent read one public https URL and reason over the
 * response. The URL comes from the user, so it is validated against this policy
 * before any request leaves the runtime, and every redirect hop is revalidated
 * with the same function.
 */

export const ENDPOINT_METRICS = [
  "http_status",
  "response_time_ms",
  "content_length",
  "content_changed",
] as const;

export type EndpointMetric = (typeof ENDPOINT_METRICS)[number];

export const ENDPOINT_LIMITS = {
  /** Requests are GET-only and abandoned after this long. */
  requestTimeoutMs: 10_000,
  /** Response bodies are read up to this size and then truncated. */
  maxBodyBytes: 64 * 1024,
  /** Redirects are followed manually, each hop revalidated, up to this many. */
  maxRedirects: 2,
} as const;

export type EndpointRejection =
  | "not_a_url"
  | "scheme_not_https"
  | "credentials_in_url"
  | "host_not_public"
  | "address_not_public";

export type EndpointCheck =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: EndpointRejection; message: string };

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_SUFFIXES = [".local", ".internal"];

/** Loopback, private, link-local, carrier-grade NAT, multicast and reserved. */
export function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;

  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** Loopback, link-local and unique-local, including IPv4-mapped forms. */
export function isBlockedIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":")) return false;
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80")) return true;
  if (/^f[cd]/.test(host)) return true;
  if (host.startsWith("::ffff:")) return isBlockedIpv4(host.slice(7));
  return false;
}

export function checkEndpointTarget(rawUrl: unknown): EndpointCheck {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "not_a_url", message: "Enter a complete URL, including https://." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "scheme_not_https", message: "Only https endpoints can be read." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_in_url", message: "URLs with embedded credentials are not allowed." };
  }

  const hostname = url.hostname.toLowerCase();
  const blockedName = !hostname
    || BLOCKED_HOSTNAMES.has(hostname)
    || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  if (blockedName) {
    return { ok: false, reason: "host_not_public", message: "That host cannot be read from the GARDN runtime." };
  }
  if (isBlockedIpv4(hostname) || isBlockedIpv6(hostname)) {
    return { ok: false, reason: "address_not_public", message: "Private and link-local addresses cannot be read." };
  }

  return { ok: true, url: url.toString(), host: hostname };
}

export function isReadableEndpoint(rawUrl: unknown): boolean {
  return checkEndpointTarget(rawUrl).ok;
}

/**
 * A first run has no stored baseline, so nothing can have "changed" yet.
 * Change is only ever reported against a hash captured by a previous run.
 */
export function contentChanged(currentHash: string, previousHash: string | null | undefined): boolean {
  if (!previousHash) return false;
  return currentHash !== previousHash;
}
