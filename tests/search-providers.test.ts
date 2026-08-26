import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROVIDER,
  SEARCH_PROVIDERS,
  cleanSearchQuery,
  isProviderId,
  providerChain,
} from "../packages/contracts/src/search-providers.ts";

test("a query is encoded into the url, never concatenated into it", () => {
  // The attack this closes: a query that ends the parameter and appends its
  // own, steering the search or the request itself.
  const url = SEARCH_PROVIDERS.brave.build('solana "volume spike" &count=1&safesearch=off');

  const parsed = new URL(url);

  assert.ok(url.startsWith("https://api.search.brave.com/"));
  assert.ok(!url.includes('"'), "quotes are encoded");
  assert.equal(parsed.searchParams.get("count"), "10", "the real parameter survives intact");
  assert.equal(parsed.searchParams.get("safesearch"), null, "a query cannot append parameters of its own");
  assert.deepEqual([...parsed.searchParams.keys()].sort(), ["count", "q"], "and cannot introduce any others");
  assert.ok(
    parsed.searchParams.get("q")?.includes("&count=1"),
    "the injection attempt survives intact as part of the query itself",
  );
});

test("every provider encodes its query, whatever shape its url takes", () => {
  // Marginalia carries the query in the path rather than a parameter, which is
  // the case a parameter-only assumption would miss.
  for (const provider of Object.values(SEARCH_PROVIDERS)) {
    const url = provider.build("a b/c?d=e#f");

    assert.doesNotThrow(() => new URL(url), `${provider.id} still builds a valid url`);
    assert.equal(new URL(url).hostname, provider.host, `${provider.id} cannot be steered off its own host`);
  }
});

test("each provider's own response shape is read into candidates", () => {
  const brave = SEARCH_PROVIDERS.brave.parse(
    JSON.stringify({
      web: {
        results: [
          { title: "Pair search", url: "https://api.example.com/search", description: "pairs" },
          { title: "No url here", description: "skipped" },
        ],
      },
    }),
  );

  assert.equal(brave.length, 1, "a result without a url is not a candidate");
  assert.equal(brave[0]?.url, "https://api.example.com/search");
  assert.equal(brave[0]?.title, "Pair search");

  const marginalia = SEARCH_PROVIDERS.marginalia.parse(
    JSON.stringify({ results: [{ title: "Docs", url: "https://example.com/docs", description: "reference" }] }),
  );
  assert.equal(marginalia[0]?.url, "https://example.com/docs");

  const duck = SEARCH_PROVIDERS.duckduckgo.parse(
    JSON.stringify({ RelatedTopics: [{ FirstURL: "https://example.com/x", Text: "a topic" }] }),
  );
  assert.equal(duck[0]?.url, "https://example.com/x");
});

test("an unparseable or unexpected response costs a provider its turn, not the run", () => {
  for (const provider of Object.values(SEARCH_PROVIDERS)) {
    assert.deepEqual(provider.parse("not json"), [], `${provider.id} survives a non-json body`);
    assert.deepEqual(provider.parse("{}"), [], `${provider.id} survives a body missing its results`);
    assert.deepEqual(provider.parse(""), [], `${provider.id} survives an empty body`);
  }

  // A provider that changed its format, or answered with an error page, must
  // return nothing rather than throw — the chain has to be able to continue.
  assert.deepEqual(SEARCH_PROVIDERS.brave.parse('{"web":{"results":"wrong shape"}}'), []);
  assert.deepEqual(SEARCH_PROVIDERS.duckduckgo.parse('{"RelatedTopics":{"not":"an array"}}'), []);
});

test("a search engine going down costs a retry, not the whole run", () => {
  const chain = providerChain("marginalia", false);

  assert.equal(chain[0], "marginalia", "the requested provider is still tried first");
  assert.ok(chain.length > 1, "and something else is tried when it fails");
});

test("a provider needing a key is never attempted without one", () => {
  // A request that is certain to fail is not worth making.
  assert.ok(!providerChain("marginalia", false).includes("brave"));
  assert.ok(!providerChain("brave", false).includes("brave"), "even when it was the one asked for");
  assert.ok(providerChain("brave", false).length > 0, "and the search still has somewhere to go");
});

test("a key unlocks the provider that needs one without dropping the free ones", () => {
  const chain = providerChain("brave", true);

  assert.equal(chain[0], "brave");
  assert.ok(chain.includes("marginalia"), "brave failing still falls through");
});

test("no provider is tried twice in one chain", () => {
  for (const preferred of [...Object.keys(SEARCH_PROVIDERS), "nonsense", null]) {
    for (const hasCredential of [true, false]) {
      const chain = providerChain(preferred, hasCredential);
      assert.equal(new Set(chain).size, chain.length, `${String(preferred)}/${hasCredential} repeats nothing`);
    }
  }
});

test("an unknown provider falls back rather than failing", () => {
  assert.equal(providerChain("google", false)[0], DEFAULT_PROVIDER);
  assert.equal(SEARCH_PROVIDERS[DEFAULT_PROVIDER].needsCredential, false, "the default needs no key");
});

test("only known providers are accepted", () => {
  assert.equal(isProviderId("brave"), true);
  assert.equal(isProviderId("google"), false);
  assert.equal(isProviderId(undefined), false);
});

test("an empty query is not a search", () => {
  assert.deepEqual(cleanSearchQuery({ query: "  solana volume api  " }), {
    query: "solana volume api",
    provider: DEFAULT_PROVIDER,
  });
  assert.deepEqual(cleanSearchQuery({ query: "x y", provider: "duckduckgo" }), { query: "x y", provider: "duckduckgo" });
  assert.equal(cleanSearchQuery({ query: "   ", provider: "brave" }), null);
  assert.equal(cleanSearchQuery(null), null);
});

test("which providers need a key of your own", () => {
  assert.equal(SEARCH_PROVIDERS.brave.needsCredential, true);
  assert.equal(SEARCH_PROVIDERS.marginalia.needsCredential, false);
  assert.equal(SEARCH_PROVIDERS.duckduckgo.needsCredential, false);
});
