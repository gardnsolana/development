/**
 * How a credential a user brought is attached to a request, and the two rules
 * that stop it going anywhere it shouldn't.
 *
 * A credential is bound to a single host. It is never attached to a request to
 * any other, so a key for one provider cannot be sent to a second — including
 * one an agent reached by following something out of a response.
 *
 * And the binding is re-evaluated on every redirect hop rather than once at the
 * start. A request that redirects off the credential's host continues without
 * it, because following one with the key still attached would hand it to
 * whoever controls the destination.
 */

export const CREDENTIAL_SCHEMES = ["bearer", "header", "query"] as const;
export type CredentialScheme = (typeof CREDENTIAL_SCHEMES)[number];

export type Credential = {
  /** The only host this key may ever be sent to. */
  host: string;
  scheme: CredentialScheme;
  /** Header or query-parameter name. Unused for bearer. */
  parameterName: string | null;
  secret: string;
};

export type PreparedRequest = {
  url: string;
  headers: Record<string, string>;
  /** Whether the credential was attached to this particular request. */
  applied: boolean;
};

export const DEFAULT_PARAMETER_NAMES = {
  header: "x-api-key",
  query: "api_key",
} as const;

export function isCredentialScheme(value: unknown): value is CredentialScheme {
  return typeof value === "string" && (CREDENTIAL_SCHEMES as readonly string[]).includes(value);
}

/** Host comparison is case-insensitive and exact — no suffix or wildcard matching. */
export function bindsTo(credential: Credential | null, url: URL): boolean {
  if (!credential) return false;
  return credential.host.trim().toLowerCase() === url.hostname.toLowerCase();
}

/**
 * Builds the request. When the credential does not belong to this host it is
 * simply absent — not blanked, not sent empty, absent.
 */
export function prepareRequest(
  url: URL,
  credential: Credential | null,
  baseHeaders: Record<string, string> = {},
): PreparedRequest {
  const headers = { ...baseHeaders };
  if (!bindsTo(credential, url)) {
    return { url: url.toString(), headers, applied: false };
  }

  const applied = credential!;
  if (applied.scheme === "bearer") {
    headers.authorization = `Bearer ${applied.secret}`;
    return { url: url.toString(), headers, applied: true };
  }

  if (applied.scheme === "header") {
    const name = (applied.parameterName || DEFAULT_PARAMETER_NAMES.header).toLowerCase();
    headers[name] = applied.secret;
    return { url: url.toString(), headers, applied: true };
  }

  // A key in the query string is the one that ends up in stored evidence if
  // nothing removes it, so whatever persists this must redact first.
  const withKey = new URL(url.toString());
  withKey.searchParams.set(applied.parameterName || DEFAULT_PARAMETER_NAMES.query, applied.secret);
  return { url: withKey.toString(), headers, applied: true };
}

/**
 * Whether a credential survives a redirect. It does only when the destination
 * is the same host it was bound to.
 */
export function survivesRedirect(credential: Credential | null, from: URL, to: URL): boolean {
  return bindsTo(credential, from) && bindsTo(credential, to);
}

/** True when a scheme puts the secret in the URL, and therefore into anything that stores it. */
export function leaksIntoUrl(scheme: CredentialScheme): boolean {
  return scheme === "query";
}
