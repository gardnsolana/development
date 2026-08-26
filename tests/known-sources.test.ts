import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWN_SOURCES,
  MAX_KNOWN_TRIED,
  MIN_MATCH_SCORE,
  knownSourcesAsList,
  matchKnownSources,
  termFrom,
} from "../packages/contracts/src/known-sources.ts";

test("every known source is immediately callable", () => {
  // A catalogue entry that needs editing before it works is worse than no
  // entry: it fails at fetch time, after the run has already committed to it.
  for (const source of KNOWN_SOURCES) {
    const url = source.build("volume spike on solana");

    assert.ok(url.startsWith("https://"), `${source.id} is https`);
    assert.doesNotThrow(() => new URL(url), `${source.id} parses as a url`);
    assert.ok(!/TERM|\{|\}|<|>/.test(url), `${source.id} has no placeholder left in it`);
  }
});

test("a request reaches the source that answers it", () => {
  assert.equal(matchKnownSources("solana liquidity pools with volume")[0]?.source.id, "pools");
  assert.equal(matchKnownSources("what is trending right now")[0]?.source.id, "trending");
  assert.equal(matchKnownSources("new token launches created recently")[0]?.source.id, "new-pools");
});

test("a request the catalogue does not cover matches nothing", () => {
  // This is the property that keeps the catalogue honest. Without it, every
  // request would be answered by whichever entry shared a word with it, and
  // discovery would never reach the search path at all.
  assert.deepEqual(matchKnownSources("weather forecast for berlin"), []);
  assert.deepEqual(matchKnownSources("nearest railway station opening hours"), []);
  assert.deepEqual(matchKnownSources(""), []);
  assert.deepEqual(matchKnownSources(null), []);
});

test("matching is on whole words, never on substrings", () => {
  // "for" appears inside "before". A substring match therefore scores an
  // unrelated request against an entry that merely contains a longer word,
  // which is exactly how the weather query above used to find a match.
  const incidental = matchKnownSources("what is this for");

  assert.deepEqual(incidental, [], "a word buried inside another word is not a match");
});

test("one incidental word is not a reason to fetch", () => {
  assert.ok(MIN_MATCH_SCORE > 0, "some floor exists");

  for (const match of matchKnownSources("solana token volume price liquidity")) {
    assert.ok(match.score >= MIN_MATCH_SCORE, "everything returned clears the floor");
  }
});

test("only a few sources are tried, best first", () => {
  const matches = matchKnownSources("solana token volume price liquidity market pools");

  assert.ok(matches.length <= MAX_KNOWN_TRIED, "the known-source pass stays bounded");
  for (let index = 1; index < matches.length; index += 1) {
    assert.ok(matches[index - 1]!.score >= matches[index]!.score, "ordered by score");
  }
});

test("a chain name is never used as a token search term", () => {
  // A pair search matches token names, so "solana" finds tokens *called*
  // solana on whatever chain they live on — which returns pairs from somewhere
  // else entirely for a request that plainly meant this chain.
  assert.equal(termFrom("volume spikes on solana", "raydium"), "raydium");
  assert.equal(termFrom("solana pumpswap pairs", "raydium"), "pumpswap", "a venue in the request still wins");
  assert.equal(termFrom("find me some movers", "raydium"), "raydium", "a fallback keeps the url valid");

  const url = matchKnownSources("solana pairs volume liquidity")[0]?.url ?? "";
  assert.ok(!url.includes("q=solana"), "the chain never becomes the search term");
});

test("ordering is stable when two sources score the same", () => {
  // A run that picks a different source each time for the same request is not
  // reproducible, and a run nobody can reproduce cannot be evidence.
  const first = matchKnownSources("solana pools liquidity volume").map((match) => match.source.id);
  const again = matchKnownSources("solana pools liquidity volume").map((match) => match.source.id);

  assert.deepEqual(first, again);
});

test("the planner list is written from the same catalogue the runtime fetches", () => {
  const list = knownSourcesAsList();

  for (const source of KNOWN_SOURCES) {
    assert.ok(list.includes(source.build("")), `${source.id} appears with its real url`);
  }
  assert.equal(list.split("\n").length, KNOWN_SOURCES.length, "one line per source, nothing invented");
});
