/**
 * What happens to a credential when the agent that needs it changes hands.
 *
 * An agent that can be sold and a key that must stay private look like they
 * conflict. They don't, because they are separate things: an agent declares
 * *which* credential it requires, and the secret is resolved at run time from
 * whoever is running it.
 *
 * So the requirement travels and the secret never does. A buyer sees that an
 * agent needs a Birdeye key before they pay for it, and then runs it on their
 * own — or doesn't run it at all. At no point does anyone receive somebody
 * else's key, and at no point is a listing degraded by hiding what it needs.
 */

export type CredentialRequirement = {
  /** A stable name for the provider, shown on a listing before purchase. */
  provider: string;
  /** Optional note about which plan or scope is needed. */
  detail?: string;
};

/** What an agent definition carries. Never a secret — only a reference. */
export type AgentCredentialRef = {
  credentialId: string | null;
  requirement: CredentialRequirement | null;
};

export type CredentialRecord = {
  id: string;
  ownerEmail: string;
  provider: string;
};

/**
 * Forking or buying an agent keeps what it needs and drops what it had. The
 * new owner starts with the requirement visible and no credential attached.
 */
export function transferCredentialRef(source: AgentCredentialRef): AgentCredentialRef {
  return { credentialId: null, requirement: source.requirement };
}

/**
 * A credential resolves only for the account running the agent. An id belonging
 * to someone else resolves to nothing rather than to their key — this is the
 * check that makes a sold agent safe.
 */
export function resolvableBy(
  record: CredentialRecord | null,
  runnerEmail: string,
  requestedId: string | null,
): boolean {
  if (!requestedId || !record) return false;
  return record.id === requestedId && record.ownerEmail === runnerEmail;
}

/** Whether an agent can actually run: it either needs nothing, or has its own. */
export function isRunnable(ref: AgentCredentialRef): boolean {
  return ref.requirement === null || ref.credentialId !== null;
}

/**
 * What a buyer is told before paying. A requirement is never hidden to make a
 * listing look simpler — an unmet one after purchase is worse than a smaller
 * catalogue.
 */
export function listingDisclosure(ref: AgentCredentialRef): string | null {
  if (!ref.requirement) return null;
  const { provider, detail } = ref.requirement;
  return detail
    ? `Requires your own ${provider} key — ${detail}`
    : `Requires your own ${provider} key`;
}
