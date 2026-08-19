// GARDN authenticates a wallet by asking it to sign a human-readable, domain-bound,
// single-use, time-boxed message. The signature proves control of the address and
// NEVER authorizes a transaction, transfer, or approval. No seed phrase or private
// key is ever requested. Signature verification itself is performed server-side.

export const SIGN_IN_STATEMENT =
  "Sign in to GARDN. This request proves you control this wallet. It does not authorize any transaction or transfer.";

export const SIGN_IN_TTL_SECONDS = 300;

export type SignInMessageInput = {
  domain: string;
  uri: string;
  chain: string;
  address: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  requestId: string;
};

function requireField(value: string, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${field} is required.`);
  return normalized;
}

function requireTimestamp(value: string, field: string): string {
  const normalized = requireField(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new TypeError(`${field} must be a valid ISO timestamp.`);
  return normalized;
}

export function buildSignInMessage(input: SignInMessageInput): string {
  const domain = requireField(input.domain, "domain");
  const uri = requireField(input.uri, "uri");
  const chain = requireField(input.chain, "chain");
  const address = requireField(input.address, "address");
  const nonce = requireField(input.nonce, "nonce");
  const issuedAt = requireTimestamp(input.issuedAt, "issuedAt");
  const expiresAt = requireTimestamp(input.expiresAt, "expiresAt");
  const requestId = requireField(input.requestId, "requestId");

  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new RangeError("expiresAt must be after issuedAt.");
  }

  return [
    `${domain} wants you to sign in with your ${chain} account:`,
    address,
    "",
    SIGN_IN_STATEMENT,
    "",
    `URI: ${uri}`,
    `Chain: ${chain}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${expiresAt}`,
    `Request ID: ${requestId}`,
  ].join("\n");
}

export type ChallengeState = {
  expiresAt: string;
  consumedAt?: string | null;
};

export type ChallengeValidity =
  | { usable: true; reason: null }
  | { usable: false; reason: "expired" | "already_used" };

// A challenge is usable once, before it expires. Verification of the signature
// and binding to the exact stored message happen server-side after this gate.
export function challengeUsability(state: ChallengeState, now: Date = new Date()): ChallengeValidity {
  if (state.consumedAt) return { usable: false, reason: "already_used" };
  if (Date.parse(state.expiresAt) <= now.getTime()) return { usable: false, reason: "expired" };
  return { usable: true, reason: null };
}
