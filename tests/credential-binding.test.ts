import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PARAMETER_NAMES,
  bindsTo,
  isCredentialScheme,
  leaksIntoUrl,
  prepareRequest,
  survivesRedirect,
  type Credential,
} from "../packages/contracts/src/credential-binding.ts";

const SECRET = "sk-live-abcdef123456";
const bearer: Credential = { host: "public-api.birdeye.so", scheme: "bearer", parameterName: null, secret: SECRET };
const header: Credential = { host: "pro-api.solscan.io", scheme: "header", parameterName: "token", secret: SECRET };
const query: Credential = { host: "api.example.com", scheme: "query", parameterName: "api_key", secret: SECRET };

test("a credential is attached only to the host it is bound to", () => {
  assert.equal(bindsTo(bearer, new URL("https://public-api.birdeye.so/defi/x")), true);
  assert.equal(bindsTo(bearer, new URL("https://PUBLIC-API.BIRDEYE.SO/defi/x")), true, "host comparison is case-insensitive");
  assert.equal(bindsTo(bearer, new URL("https://evil.example/steal")), false);
  assert.equal(bindsTo(null, new URL("https://public-api.birdeye.so/x")), false);
});

test("matching is exact — a suffix is not the same host", () => {
  // The attack this closes: registering birdeye.so.evil.example and hoping a
  // loose match sends the key there.
  assert.equal(bindsTo(bearer, new URL("https://public-api.birdeye.so.evil.example/x")), false);
  assert.equal(bindsTo(bearer, new URL("https://not-public-api.birdeye.so/x")), false);
});

test("a key for one provider never reaches a request to another", () => {
  const prepared = prepareRequest(new URL("https://evil.example/steal"), bearer);

  assert.equal(prepared.applied, false);
  assert.deepEqual(prepared.headers, {}, "no header carries it");
  assert.ok(!prepared.url.includes(SECRET), "and neither does the url");
});

test("each scheme applies where it belongs", () => {
  const asBearer = prepareRequest(new URL("https://public-api.birdeye.so/defi/x"), bearer);
  assert.equal(asBearer.headers.authorization, `Bearer ${SECRET}`);
  assert.ok(!asBearer.url.includes(SECRET));

  const asHeader = prepareRequest(new URL("https://pro-api.solscan.io/v2.0/x"), header);
  assert.equal(asHeader.headers.token, SECRET);

  const asQuery = prepareRequest(new URL("https://api.example.com/v1/data?limit=20"), query);
  assert.ok(asQuery.url.includes(`api_key=${SECRET}`));
  assert.ok(asQuery.url.includes("limit=20"), "existing parameters survive");
  assert.deepEqual(asQuery.headers, {}, "a query key is not also sent as a header");
});

test("a missing parameter name falls back rather than sending an unnamed key", () => {
  const namelessHeader = prepareRequest(new URL("https://pro-api.solscan.io/x"), { ...header, parameterName: null });
  assert.equal(namelessHeader.headers[DEFAULT_PARAMETER_NAMES.header], SECRET);

  const namelessQuery = prepareRequest(new URL("https://api.example.com/x"), { ...query, parameterName: null });
  assert.ok(namelessQuery.url.includes(`${DEFAULT_PARAMETER_NAMES.query}=${SECRET}`));
});

test("base headers are preserved and the credential added alongside", () => {
  const prepared = prepareRequest(new URL("https://public-api.birdeye.so/x"), bearer, { accept: "application/json" });

  assert.equal(prepared.headers.accept, "application/json");
  assert.equal(prepared.headers.authorization, `Bearer ${SECRET}`);
});

test("a redirect off the bound host drops the credential", () => {
  const from = new URL("https://public-api.birdeye.so/defi/x");
  const sameHost = new URL("https://public-api.birdeye.so/defi/y");
  const elsewhere = new URL("https://collector.example/catch");

  assert.equal(survivesRedirect(bearer, from, sameHost), true);
  assert.equal(survivesRedirect(bearer, from, elsewhere), false, "following with the key attached would hand it over");
  assert.equal(prepareRequest(elsewhere, bearer).applied, false);
});

test("the scheme that writes a secret into the url is identified", () => {
  // Whatever persists a request has to know when redaction is required.
  assert.equal(leaksIntoUrl("query"), true);
  assert.equal(leaksIntoUrl("bearer"), false);
  assert.equal(leaksIntoUrl("header"), false);
});

test("only the three known schemes are accepted", () => {
  assert.equal(isCredentialScheme("bearer"), true);
  assert.equal(isCredentialScheme("basic"), false);
  assert.equal(isCredentialScheme(undefined), false);
});
