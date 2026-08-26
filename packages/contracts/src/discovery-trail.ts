/**
 * How a source is arrived at, and what may be chosen as one.
 *
 * Discovery is the difference between handing an agent a URL and giving it an
 * objective. The objective is the honest interface — most people do not know
 * where the data lives, and should not have to — but it puts the agent in the
 * position of deciding what to trust, which is the part that needs rules.
 *
 * One rule carries most of the weight: a search result is a *claim* about a
 * page, not evidence about it. A title and a snippet are written by whoever
 * published the page, and are frequently wrong about whether the page returns
 * data at all. So nothing is ever chosen on a title. Everything is fetched, and
 * what came back decides.
 *
 * The second rule is that a page which documents an endpoint is not itself the
 * endpoint. A search engine indexes the documentation; the answer is written
 * down inside it. A person reads the docs and then calls the API, and so does
 * this — which is why reading a page is a distinct step with its own record.
 *
 * The third is that how a source was found is part of the evidence. A run that
 * cannot say whether it used something already known, something it searched
 * for, or something it read out of a page is not reproducible, and a run nobody
 * can reproduce is not proof of anything.
 */

/** Where a candidate came from. Recorded per candidate, not inferred later. */
export type Origin = "known" | "search" | "page";

/** How the chosen source was arrived at overall. */
export type Via = "catalogue" | "search";

export type Candidate = {
  url: string;
  /** What this was expected to be, from a catalogue entry or a search result. */
  title: string;
  origin: Origin;
  /** Set when the candidate was read out of a page rather than found directly. */
  foundOn?: string;
  /** The verdict from actually fetching it. */
  answered: boolean;
  kind: string;
  problem: string | null;
};

export type Trail = {
  request: string;
  via: Via;
  considered: Candidate[];
  /** The page whose documentation produced the endpoint, when one did. */
  readPage: string | null;
  chosen: string | null;
};

/**
 * A usable source answered, and answered with data.
 *
 * Not a browser page, not an auth wall, not an empty list. That judgement comes
 * from the fetch and never from the search engine's opinion of the page — see
 * `endpoint-probe` for how a response is classified.
 */
export function isUsable(candidate: Pick<Candidate, "answered" | "kind">): boolean {
  return candidate.answered && candidate.kind === "json";
}

/**
 * The order discovery works in.
 *
 * Known sources first because they are already understood to answer. Search
 * second, for anything the catalogue does not cover. Reading a page last,
 * because it costs the most and is only worth doing once the direct candidates
 * have failed.
 */
export const DISCOVERY_ORDER: Origin[] = ["known", "search", "page"];

/** How many endpoints extracted from one page are worth checking. */
export const MAX_EXTRACTED = 4;

/** How many pages are read when no direct candidate answered. */
export const MAX_PAGES_READ = 2;

/**
 * Whether a URL pulled out of a page is worth fetching at all.
 *
 * It has to be complete. A URL missing a required parameter answers 400 or 422
 * and is worthless as a source, so an endpoint documented as a shape rather
 * than an example is rejected here instead of consuming a fetch. Everything
 * here arrived from a third-party page, so none of it is trusted — this is only
 * the cheap filter before the real check, which is fetching it.
 */
export function isWorthFetching(rawUrl: unknown): boolean {
  if (typeof rawUrl !== "string") return false;
  const url = rawUrl.trim();
  if (!url.startsWith("https://")) return false;
  // A placeholder left in the URL means the page documented a shape, not a call.
  if (/[<>{}\[\]]|:[a-z_]+\b|\bYOUR_|\bAPI_KEY\b|\bTERM\b|\.\.\./i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return Boolean(parsed.hostname) && parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Extracted endpoints, filtered and bounded before any of them is fetched. */
export function extractedWorthTrying(urls: readonly unknown[]): string[] {
  const seen = new Set<string>();
  return urls
    .filter(isWorthFetching)
    .map((url) => (url as string).trim())
    .filter((url) => (seen.has(url) ? false : (seen.add(url), true)))
    .slice(0, MAX_EXTRACTED);
}

/**
 * Whether the trail justifies the source it settled on.
 *
 * The check that matters for evidence: a chosen source has to appear among the
 * candidates that were actually fetched, and that candidate has to have
 * returned data. A trail claiming a source it never checked is worse than no
 * trail at all, because it looks like proof.
 */
export function trailSupportsChoice(trail: Trail): boolean {
  if (!trail.chosen) return true;
  const candidate = trail.considered.find((item) => item.url === trail.chosen);
  return Boolean(candidate && isUsable(candidate));
}

/** Whether a trail that read a page recorded which page it read. */
export function pageReadIsRecorded(trail: Trail): boolean {
  const derived = trail.considered.some((candidate) => candidate.origin === "page");
  return derived ? Boolean(trail.readPage) : true;
}

/**
 * What the trail is called in the product.
 *
 * Reaching for a source already known is not the same act as searching the open
 * web, and describing both as a search would misrepresent the cheaper one.
 */
export function describeVia(via: Via): string {
  return via === "catalogue" ? "Checked the sources GARDN knows" : "Searched the web";
}

export function describeOrigin(candidate: Candidate): string {
  if (candidate.origin === "known") return "a source GARDN already knows";
  if (candidate.origin === "page") return "found in the page above";
  return "found by searching";
}
