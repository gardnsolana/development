/**
 * The specific things a run surfaces, and the rules that keep them safe to show.
 *
 * A finding names something worth acting on, quotes the numbers that make it
 * notable, says what to do about it, and links to it. The link is the sensitive
 * part: the model producing these findings has just read third-party content,
 * and a hostile source can put anything in it. So a link is never something the
 * model writes — it is copied out of the observation, checked, and always
 * displayed alongside the host it actually goes to, so a reader sees the
 * destination before deciding to follow it.
 */

export type RunFinding = {
  label: string;
  detail: string;
  action: string;
  /** Null whenever the supplied link failed the checks below. */
  link: string | null;
  /** Carried separately so a destination can never be misrepresented by its text. */
  host: string | null;
};

export type FindingCandidate = {
  label?: unknown;
  detail?: unknown;
  action?: unknown;
  link?: unknown;
};

export const FINDING_LIMITS = {
  label: 60,
  detail: 220,
  action: 260,
  link: 400,
  maxFindings: 8,
} as const;

export type LinkCheck =
  | { ok: true; link: string; host: string }
  | { ok: false; reason: "absent" | "unparseable" | "not_https" | "has_credentials" };

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

/**
 * Links arrive from content a third party served, so they are checked rather
 * than trusted. Anything that fails is dropped entirely: a finding without a
 * link is fine, a finding with a bad one is not.
 */
export function checkFindingLink(value: unknown): LinkCheck {
  const raw = text(value, FINDING_LIMITS.link);
  if (!raw) return { ok: false, reason: "absent" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  // Credentials in a URL are a classic way to dress one destination as another.
  if (url.username || url.password) return { ok: false, reason: "has_credentials" };

  return { ok: true, link: url.toString(), host: url.hostname };
}

/**
 * A finding needs a label and a detail to be worth showing at all. An action is
 * optional — sometimes the honest answer is that nothing needs doing — but a
 * nameless or unexplained finding is noise.
 */
export function cleanFinding(candidate: unknown): RunFinding | null {
  if (!candidate || typeof candidate !== "object") return null;
  const raw = candidate as FindingCandidate;

  const label = text(raw.label, FINDING_LIMITS.label);
  const detail = text(raw.detail, FINDING_LIMITS.detail);
  if (!label || !detail) return null;

  const checked = checkFindingLink(raw.link);
  return {
    label,
    detail,
    action: text(raw.action, FINDING_LIMITS.action),
    link: checked.ok ? checked.link : null,
    host: checked.ok ? checked.host : null,
  };
}

export function cleanFindings(value: unknown): RunFinding[] {
  if (!Array.isArray(value)) return [];
  const kept: RunFinding[] = [];
  for (const item of value) {
    if (kept.length >= FINDING_LIMITS.maxFindings) break;
    const finding = cleanFinding(item);
    if (finding) kept.push(finding);
  }
  return kept;
}

/**
 * A link is only safe to show with its host beside it. This pairs the two so a
 * renderer cannot present one without the other by accident.
 */
export function describeLink(finding: RunFinding): { href: string; host: string } | null {
  return finding.link && finding.host ? { href: finding.link, host: finding.host } : null;
}
