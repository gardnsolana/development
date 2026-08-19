import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignInMessage,
  challengeUsability,
  SIGN_IN_STATEMENT,
  type SignInMessageInput,
} from "../packages/contracts/src/wallet-signin-message.ts";

const base: SignInMessageInput = {
  domain: "gardn.run",
  uri: "https://gardn.run",
  chain: "solana:mainnet",
  address: "FWiZ9LuyxVtkLhEVLPTF8xWyvhS36731QUpH6iN1T4mA",
  nonce: "abc123",
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-01T00:05:00.000Z",
  requestId: "req_1",
};

test("the message is domain-bound and names the account", () => {
  const message = buildSignInMessage(base);
  assert.match(message, /^gardn\.run wants you to sign in with your solana:mainnet account:/);
  assert.ok(message.includes(base.address));
});

test("the message states it authorizes no transaction", () => {
  assert.ok(buildSignInMessage(base).includes(SIGN_IN_STATEMENT));
  assert.match(SIGN_IN_STATEMENT, /does not authorize any transaction/);
});

test("nonce, expiry and request id are embedded", () => {
  const message = buildSignInMessage(base);
  assert.ok(message.includes("Nonce: abc123"));
  assert.ok(message.includes("Expires At: 2026-01-01T00:05:00.000Z"));
  assert.ok(message.includes("Request ID: req_1"));
});

test("missing fields and bad time ranges are rejected", () => {
  assert.throws(() => buildSignInMessage({ ...base, nonce: "" }));
  assert.throws(() => buildSignInMessage({ ...base, issuedAt: "not-a-date" }));
  assert.throws(() => buildSignInMessage({ ...base, expiresAt: base.issuedAt }));
});

test("a challenge is usable once, before expiry", () => {
  const now = new Date("2026-01-01T00:02:00.000Z");
  assert.equal(challengeUsability({ expiresAt: base.expiresAt }, now).usable, true);
  assert.deepEqual(challengeUsability({ expiresAt: base.issuedAt }, now), { usable: false, reason: "expired" });
  assert.deepEqual(challengeUsability({ expiresAt: base.expiresAt, consumedAt: base.issuedAt }, now), { usable: false, reason: "already_used" });
});
