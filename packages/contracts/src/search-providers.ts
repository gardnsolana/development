/**
 * Searching the open web for a source, and surviving a search engine going down.
 *
 * Search is the least reliable link in the discovery chain. The providers that
 * need no key rate-limit without warning and disappear without notice — one of
 * them went down mid-session during development and returned four minutes
 * later, having answered five consecutive requests in under a second before
 * that. Nothing about the request was different.
 *
 * So a failed search is treated as a normal condition rather than an error. It
 * falls through to the next provider that can run, and only a chain where every
 * provider failed is a failed search. Losing one engine should cost a retry,
 * not the whole run.
 *
 * A search result is also never trusted on its own. What a provider returns is
 * a claim about a page — a title and a snippet — and what a page contains is
 * decided by fetching it, never by reading the claim. That check lives in
 * `discovery-trail`; this contract only has to produce candidates honestly.
 */

export type ProviderId = "brave" | "marginalia" | "duckduckgo";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchProvider = {
  id: ProviderId;
  label: string;
  /** Whether the caller must supply a key of their own to use this provider. */
  needsCredential: boolean;
  host: string;
  build(query: string): string;
  parse(body: string): SearchResult[];
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

/**
 * Reads a provider's own response shape into candidates.
 *
 * Anything unparseable or unexpected yields no candidates rather than throwing.
 * A provider that has changed its response format, or is answering with an
 * error page, should cost this provider its turn — not the run.
 */
function parser(extract: (parsed: Record<string, unknown>) => unknown, fields: { url: string; title: string; snippet: string }) {
  return (body: string): SearchResult[] => {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      return records(extract(parsed)).flatMap((item) => {
        const url = text(item[fields.url], 400);
        return url ? [{ title: text(item[fields.title], 160), url, snippet: text(item[fields.snippet], 300) }] : [];
      });
    } catch {
      return [];
    }
  };
}

export const SEARCH_PROVIDERS: Record<ProviderId, SearchProvider> = {
  brave: {
    id: "brave",
    label: "Brave Search",
    needsCredential: true,
    host: "api.search.brave.com",
    build: (query) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
    parse: parser((parsed) => (parsed.web as Record<string, unknown> | undefined)?.results, {
      url: "url",
      title: "title",
      snippet: "description",
    }),
  },
  marginalia: {
    id: "marginalia",
    label: "Marginalia",
    needsCredential: false,
    host: "api.marginalia.nu",
    build: (query) => `https://api.marginalia.nu/public/search/${encodeURIComponent(query)}`,
    parse: parser((parsed) => parsed.results, { url: "url", title: "title", snippet: "description" }),
  },
  duckduckgo: {
    id: "duckduckgo",
    label: "DuckDuckGo",
    needsCredential: false,
    host: "api.duckduckgo.com",
    build: (query) => `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
    parse: parser((parsed) => parsed.RelatedTopics, { url: "FirstURL", title: "Text", snippet: "Text" }),
  },
};

export function isProviderId(value: unknown): value is ProviderId {
  return value === "brave" || value === "marginalia" || value === "duckduckgo";
}

/** The provider used when none was chosen: keyless, and one that returns results. */
export const DEFAULT_PROVIDER: ProviderId = "marginalia";

/**
 * The order providers are tried in for one search.
 *
 * The requested provider goes first — an explicit choice is honoured before
 * anything else. A provider needing a key is dropped entirely when there is no
 * key rather than being attempted and failing, since a predictable failure is
 * not worth a request. Nothing is tried twice.
 */
export function providerChain(preferred: unknown, hasCredential: boolean): ProviderId[] {
  const first: ProviderId = isProviderId(preferred) ? preferred : DEFAULT_PROVIDER;
  const order: ProviderId[] = hasCredential
    ? [first, "brave", "marginalia", "duckduckgo"]
    : [first, "marginalia", "duckduckgo"];

  return [...new Set(order)].filter((id) => hasCredential || !SEARCH_PROVIDERS[id].needsCredential);
}

export type SearchQuery = {
  query: string;
  provider: ProviderId;
};

/** A request to search, normalised. An empty query is not a search. */
export function cleanSearchQuery(value: unknown): SearchQuery | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const query = text(raw.query, 300);
  if (!query) return null;
  return { query, provider: isProviderId(raw.provider) ? raw.provider : DEFAULT_PROVIDER };
}
