import assert from "node:assert/strict";
import test from "node:test";

import { extractPath, parsePath, reachesList } from "../packages/contracts/src/follow-path.ts";

const screener = {
  schemaVersion: "1.0.0",
  pairs: [
    { baseToken: { address: "AAA", symbol: "SOL" }, volume: { h24: 100 } },
    { baseToken: { address: "BBB", symbol: "USDC" }, volume: { h24: 200 } },
  ],
};

test("a path walks fields and steps into an array", () => {
  assert.deepEqual(extractPath(screener, "pairs[].baseToken.address"), ["AAA", "BBB"]);
  assert.deepEqual(extractPath(screener, "pairs[].baseToken.symbol"), ["SOL", "USDC"]);
});

test("the array marker is what distinguishes a list walk from a field read", () => {
  assert.deepEqual(parsePath("pairs[].baseToken.address"), [
    { key: "pairs", intoArray: true },
    { key: "baseToken", intoArray: false },
    { key: "address", intoArray: false },
  ]);
  assert.equal(reachesList("pairs[].baseToken.address"), true);
  assert.equal(reachesList("data.token.address"), false);
});

test("a path that matches nothing yields nothing rather than throwing", () => {
  assert.deepEqual(extractPath(screener, "pairs[].missing.field"), []);
  assert.deepEqual(extractPath(screener, "absent[].x"), []);
  assert.deepEqual(extractPath(screener, ""), []);
  assert.deepEqual(extractPath(null, "pairs[].x"), []);
  assert.deepEqual(extractPath("a string", "pairs[].x"), []);
});

test("numbers are read as values and empties skipped", () => {
  const payload = { items: [{ n: 42 }, { n: null }, { n: "" }, { n: "  keep  " }, { n: Number.NaN }] };

  assert.deepEqual(extractPath(payload, "items[].n"), ["42", "keep"]);
});

test("a value that is not a scalar is skipped rather than coerced", () => {
  // An object where an address was expected is a mistake, not a value.
  const payload = { items: [{ n: { nested: true } }, { n: ["a"] }, { n: "good" }] };

  assert.deepEqual(extractPath(payload, "items[].n"), ["good"]);
});

test("a field that is not an array is not walked as one", () => {
  const payload = { pairs: { baseToken: { address: "AAA" } } };

  assert.deepEqual(extractPath(payload, "pairs[].baseToken.address"), [], "[] requires an actual array");
  assert.deepEqual(extractPath(payload, "pairs.baseToken.address"), ["AAA"]);
});

test("nested arrays can be walked in turn", () => {
  const payload = { groups: [{ items: [{ id: "a" }, { id: "b" }] }, { items: [{ id: "c" }] }] };

  assert.deepEqual(extractPath(payload, "groups[].items[].id"), ["a", "b", "c"]);
});

test("order is preserved", () => {
  const payload = { items: [{ id: "z" }, { id: "m" }, { id: "a" }] };

  assert.deepEqual(extractPath(payload, "items[].id"), ["z", "m", "a"]);
});
