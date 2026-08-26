import assert from "node:assert/strict";
import test from "node:test";

import {
  DISCOVERY_ORDER,
  MAX_EXTRACTED,
  MAX_PAGES_READ,
  describeOrigin,
  describeVia,
  extractedWorthTrying,
  isUsable,
  isWorthFetching,
  pageReadIsRecorded,
  trailSupportsChoice,
  type Candidate,
  type Trail,
} from "../packages/contracts/src/discovery-trail.ts";

const answered = (url: string, over: Partial<Candidate> = {}): Candidate => ({
  url,
  title: "a source",
  origin: "search",
  answered: true,
  kind: "json",
  problem: null,
  ...over,
});

test("a source has to answer with data, not merely answer", () => {
  assert.equal(isUsable(answered("https://api.example.com/x")), true);
  assert.equal(isUsable({ answered: true, kind: "html-shell" }), false, "a browser page is not a source");
  assert.equal(isUsable({ answered: true, kind: "html" }), false);
  assert.equal(isUsable({ answered: false, kind: "json" }), false, "a failed fetch is not a source");
  assert.equal(isUsable({ answered: true, kind: "error" }), false);
});

test("a title is never what makes something usable", () => {
  // A search result is a claim about a page written by whoever published it.
  // Two candidates described identically, only one of which actually answers.
  const promising = answered("https://api.example.com/data", { title: "Free market data API — JSON" });
  const worthless = answered("https://blog.example.com/post", {
    title: "Free market data API — JSON",
    answered: true,
    kind: "html",
  });

  assert.equal(promising.title, worthless.title, "the claim is identical");
  assert.notEqual(isUsable(promising), isUsable(worthless), "the fetch is what separates them");
});

test("known sources are tried before searching, and reading a page comes last", () => {
  assert.deepEqual(DISCOVERY_ORDER, ["known", "search", "page"]);
  assert.ok(MAX_PAGES_READ > 0 && MAX_PAGES_READ <= 3, "reading pages is bounded — it is the expensive step");
});

test("an endpoint documented as a shape rather than a call is not fetched", () => {
  // A url missing a required value answers 400 or 422. Rejecting it here costs
  // nothing; fetching it costs a request and a place in the trail.
  assert.equal(isWorthFetching("https://api.example.com/v3/coins/{id}/market"), false);
  assert.equal(isWorthFetching("https://api.example.com/v3/coins/:id/market"), false);
  assert.equal(isWorthFetching("https://api.example.com/data?key=YOUR_API_KEY"), false);
  assert.equal(isWorthFetching("https://api.example.com/search?q=TERM"), false);
  assert.equal(isWorthFetching("https://api.example.com/v1/..."), false);

  assert.equal(isWorthFetching("https://api.example.com/v3/coins/markets?vs_currency=usd&per_page=20"), true);
});

test("nothing insecure or malformed reaches a fetch", () => {
  assert.equal(isWorthFetching("http://api.example.com/data"), false, "https only");
  assert.equal(isWorthFetching("ftp://example.com/data"), false);
  assert.equal(isWorthFetching("javascript:alert(1)"), false);
  assert.equal(isWorthFetching("not a url"), false);
  assert.equal(isWorthFetching(""), false);
  assert.equal(isWorthFetching(null), false);
  assert.equal(isWorthFetching(42), false);
});

test("extracted endpoints are deduplicated and bounded", () => {
  const many = [
    "https://api.example.com/a?x=1",
    "  https://api.example.com/a?x=1  ",
    "https://api.example.com/b?x=1",
    "https://api.example.com/c?x=1",
    "https://api.example.com/d?x=1",
    "https://api.example.com/e?x=1",
    "http://api.example.com/insecure",
    "https://api.example.com/{id}",
  ];
  const worth = extractedWorthTrying(many);

  assert.ok(worth.length <= MAX_EXTRACTED, "a page cannot spend an unbounded number of fetches");
  assert.equal(new Set(worth).size, worth.length, "the same url is not fetched twice");
  assert.ok(!worth.some((url) => url.startsWith("http://")), "the filter still applies");
  assert.equal(worth[0], "https://api.example.com/a?x=1", "and surviving urls are trimmed");
});

test("a trail cannot claim a source it never checked", () => {
  // This is the property that makes a trail evidence rather than decoration.
  const trail: Trail = {
    request: "market data",
    via: "search",
    considered: [answered("https://api.example.com/checked")],
    readPage: null,
    chosen: "https://api.example.com/never-checked",
  };

  assert.equal(trailSupportsChoice(trail), false);
  assert.equal(trailSupportsChoice({ ...trail, chosen: "https://api.example.com/checked" }), true);
});

test("a trail cannot claim a source that was checked and failed", () => {
  const trail: Trail = {
    request: "market data",
    via: "search",
    considered: [answered("https://blog.example.com/post", { kind: "html" })],
    readPage: null,
    chosen: "https://blog.example.com/post",
  };

  assert.equal(trailSupportsChoice(trail), false);
});

test("finding nothing is a valid trail", () => {
  // Discovery that comes back empty has to be representable. Forcing a choice
  // would mean answering with whatever failed least badly.
  const trail: Trail = {
    request: "something nobody publishes",
    via: "search",
    considered: [answered("https://example.com/x", { kind: "html" })],
    readPage: null,
    chosen: null,
  };

  assert.equal(trailSupportsChoice(trail), true);
});

test("an endpoint read out of a page records which page it came from", () => {
  const derived: Trail = {
    request: "market data",
    via: "search",
    considered: [answered("https://api.example.com/x", { origin: "page", foundOn: "https://example.com/docs" })],
    readPage: "https://example.com/docs",
    chosen: "https://api.example.com/x",
  };

  assert.equal(pageReadIsRecorded(derived), true);
  assert.equal(pageReadIsRecorded({ ...derived, readPage: null }), false, "the page read is not droppable");
  assert.equal(
    pageReadIsRecorded({ ...derived, considered: [answered("https://api.example.com/x")], readPage: null }),
    true,
    "a trail that read no page needs no page recorded",
  );
});

test("how a source was found is described honestly", () => {
  // Reaching for something already known is not the same act as searching, and
  // calling both a search would misrepresent the cheaper one.
  assert.notEqual(describeVia("catalogue"), describeVia("search"));
  assert.ok(!describeVia("catalogue").toLowerCase().includes("search"));

  const origins = ["known", "search", "page"] as const;
  const described = origins.map((origin) => describeOrigin(answered("https://x.example", { origin })));
  assert.equal(new Set(described).size, origins.length, "each origin reads differently");
});
