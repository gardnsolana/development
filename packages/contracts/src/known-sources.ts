/**
 * Sources GARDN already knows, and how a request reaches one.
 *
 * An agent that finds its own source could begin by searching the open web.
 * That is the obvious design and it is the wrong one. General search engines
 * index pages *about* APIs rather than the APIs themselves, so a search for
 * market data returns articles, comparisons and blog posts — none of which
 * answer when fetched. The engines that need no key index them worse.
 *
 * Meanwhile the answer to most requests is one of a small number of public
 * endpoints that anyone working in this space already knows by heart. So that
 * knowledge is written down here and fetched, rather than rediscovered badly on
 * every run.
 *
 * This is a starting point, not a whitelist. Every entry is still fetched and
 * still has to return usable data before it can be chosen, exactly like a URL
 * found by searching — an entry that has gone down loses to a search result
 * that works. And a request this catalogue does not cover matches nothing at
 * all, so it falls through to searching rather than being answered with
 * something adjacent.
 */

export type KnownSource = {
  id: string;
  label: string;
  /** What this endpoint returns, in the words someone would actually use. */
  returns: string;
  /** Terms that should pull this entry up, matched against the request. */
  keywords: readonly string[];
  /** How to vary the URL when it takes a term. Surfaced to the planner. */
  hint?: string;
  /**
   * The callable URL. Some endpoints search rather than list, so the request
   * can supply the term — the fallback keeps the URL callable when it does not.
   */
  build(request: string): string;
};

/**
 * Venues that can be used as a search term, and deliberately no chains.
 *
 * A pair search matches token *names*. So "solana" finds tokens called solana
 * on whatever chain they happen to live on, which is how a request about Solana
 * comes back full of pairs from somewhere else entirely. A venue name cannot be
 * confused for a token in the same way, and it lands on the chain that was
 * actually meant.
 */
export const SEARCH_VENUES = ["pumpswap", "raydium", "orca", "meteora", "jupiter", "pumpfun", "bonk"] as const;

export function termFrom(request: string, fallback: string): string {
  const lower = String(request ?? "").toLowerCase();
  return SEARCH_VENUES.find((venue) => lower.includes(venue)) ?? fallback;
}

export const KNOWN_SOURCES: readonly KnownSource[] = [
  {
    id: "pair-search",
    label: "Pair search",
    returns: "solana pairs with 1h and 24h volume, price change, liquidity and market cap",
    keywords: ["pair", "pairs", "dex", "volume", "liquidity", "price", "solana", "token", "spike", "mover"],
    hint: "swap the search term for any venue name or symbol",
    build: (request) => `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(termFrom(request, "raydium"))}`,
  },
  {
    id: "coin-markets",
    label: "Coin markets",
    returns: "top coins ranked by volume, with market cap and price change over several windows",
    keywords: ["coin", "coins", "market", "markets", "volume", "rank", "top", "price", "mover", "gainer"],
    build: () => "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=20",
  },
  {
    id: "trending",
    label: "Trending",
    returns: "what is being searched and traded most right now",
    keywords: ["trending", "trend", "hot", "popular", "buzz", "attention", "searched"],
    build: () => "https://api.coingecko.com/api/v3/search/trending",
  },
  {
    id: "pools",
    label: "Solana pools",
    returns: "solana liquidity pools with volume, reserve and price change",
    keywords: ["pool", "pools", "liquidity", "solana", "reserve", "amm", "volume"],
    build: () => "https://api.geckoterminal.com/api/v2/networks/solana/pools?page=1",
  },
  {
    id: "new-pools",
    label: "New solana pools",
    returns: "pools created most recently on solana, before they are listed elsewhere",
    keywords: ["new", "launch", "launches", "recent", "fresh", "created", "listing", "pool", "pools", "early"],
    build: () => "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1",
  },
  {
    id: "global",
    label: "Global market",
    returns: "total market cap, total volume and dominance across the whole market",
    keywords: ["global", "total", "dominance", "overall", "aggregate"],
    build: () => "https://api.coingecko.com/api/v3/global",
  },
];

/**
 * Below this, a match is one incidental word and not a reason to fetch anything.
 *
 * Falling through to a search is better than answering a request with a source
 * that merely shares a common word with it.
 */
export const MIN_MATCH_SCORE = 8;

/** How many known sources are tried before the search path takes over. */
export const MAX_KNOWN_TRIED = 3;

export type SourceMatch = { source: KnownSource; url: string; score: number };

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [];
}

/**
 * Which known sources are worth trying for this request, best first.
 *
 * The scoring is deliberately dumb — term overlap, nothing learned, nothing
 * stored. It only has to order a handful of entries well enough that the right
 * one gets fetched early. The fetch is what actually decides.
 */
export function matchKnownSources(request: unknown, limit: number = MAX_KNOWN_TRIED): SourceMatch[] {
  const requested = typeof request === "string" ? words(request) : [];
  if (requested.length === 0) return [];

  return KNOWN_SOURCES.map((source) => {
    // Whole words only. Substring matching quietly finds "for" inside "before",
    // which is enough to make a completely unrelated request look like a hit.
    const haystack = new Set(words(`${source.label} ${source.returns} ${source.keywords.join(" ")}`));
    const hits = new Set(requested.filter((word) => word.length > 2 && haystack.has(word)));
    // Longer matches carry more meaning: "liquidity" says more than "top".
    const score = [...hits].reduce((total, word) => total + word.length, 0);
    return { source, url: source.build(typeof request === "string" ? request : ""), score };
  })
    .filter((match) => match.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id))
    .slice(0, Math.max(0, limit));
}

/**
 * The catalogue as a list for a planner prompt.
 *
 * A planner that suggests endpoints needs the same list the runtime fetches.
 * Keeping a second copy in prose guarantees they drift, and the copy nobody
 * executes drifts first — so both are written from here.
 */
export function knownSourcesAsList(): string {
  return KNOWN_SOURCES.map((source) => {
    const line = `- ${source.returns} — ${source.build("")}`;
    return source.hint ? `${line} (${source.hint})` : line;
  }).join("\n");
}
