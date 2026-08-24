import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyResponse,
  describeJsonShape,
  looksLikeAppShell,
} from "../packages/contracts/src/endpoint-probe.ts";

const listApi = JSON.stringify({
  schemaVersion: "1.0.0",
  pairs: [
    { chainId: "solana", dexId: "pumpswap", baseToken: { symbol: "CATE" }, volume: { h24: 56154594 }, liquidity: { usd: 1532478 } },
    { chainId: "solana", dexId: "pumpswap", baseToken: { symbol: "DING" }, volume: { h24: 2960000 }, liquidity: { usd: 62700 } },
  ],
});

const spaShell = '<!doctype html><html><head><style>:root{--a:1}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const challenge = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>';

test("a JSON list is recognised, counted and described by its real fields", () => {
  const verdict = classifyResponse({ status: 200, contentType: "application/json", body: listApi });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.kind, "json");
  assert.equal(verdict.itemCount, 2);
  assert.equal(verdict.problem, null);
  assert.ok(verdict.fields.includes("pairs[]"));
  assert.ok(verdict.fields.includes("volume"));
});

test("a browser shell is refused, and named as a page rather than an auth wall", () => {
  const verdict = classifyResponse({ status: 200, contentType: "text/html", body: spaShell });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, "html-shell");
  assert.match(verdict.problem ?? "", /browser page, not a data endpoint/);
});

test("a bot challenge answering 403 is still diagnosed as a page, not a key problem", () => {
  const verdict = classifyResponse({ status: 403, contentType: "text/html", body: challenge });

  assert.equal(verdict.kind, "html-shell");
  assert.match(verdict.problem ?? "", /browser page/);
  assert.doesNotMatch(verdict.problem ?? "", /authentication/);
});

test("a genuine auth wall says so", () => {
  const verdict = classifyResponse({ status: 401, contentType: "application/json", body: "" });

  assert.equal(verdict.ok, false);
  assert.match(verdict.problem ?? "", /needs authentication/);
});

test("other failures report their status", () => {
  const verdict = classifyResponse({ status: 500, contentType: "application/json", body: "{}" });

  assert.equal(verdict.ok, false);
  assert.match(verdict.problem ?? "", /answered 500/);
});

test("JSON that will not parse is reported rather than treated as data", () => {
  const verdict = classifyResponse({ status: 200, contentType: "application/json", body: '{"pairs":[{"a":1' });

  assert.equal(verdict.ok, false);
  assert.match(verdict.problem ?? "", /could not be parsed/);
});

test("an array of scalars is a field, not the payload", () => {
  const shape = describeJsonShape(JSON.stringify({ name: "repo", topics: ["a", "b", "c"], stars: 12 }));

  assert.equal(shape.itemCount, null, "topics is not the list this response is about");
  assert.deepEqual(shape.fields, ["name", "topics", "stars"]);
});

test("a bare array is described by its first item", () => {
  const shape = describeJsonShape(JSON.stringify([{ url: "https://example.com", chainId: "solana" }]));

  assert.equal(shape.rootShape, "array");
  assert.equal(shape.itemCount, 1);
  assert.deepEqual(shape.fields, ["url", "chainId"]);
});

test("real markup with readable content is not mistaken for a shell", () => {
  const article = `<!doctype html><html><body><article>${"Genuine readable prose. ".repeat(40)}</article></body></html>`;

  assert.equal(looksLikeAppShell("text/html", article), false);
  assert.equal(classifyResponse({ status: 200, contentType: "text/html", body: article }).kind, "html");
});

test("JSON without a JSON content type is still read as JSON", () => {
  const verdict = classifyResponse({ status: 200, contentType: "text/plain", body: listApi });

  assert.equal(verdict.kind, "json");
  assert.equal(verdict.itemCount, 2);
});
