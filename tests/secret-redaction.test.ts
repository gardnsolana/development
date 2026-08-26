import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_REDACTABLE_LENGTH,
  REDACTION_MARKER,
  containsSecret,
  hint,
  isRedactable,
  redact,
  redactAll,
} from "../packages/contracts/src/secret-redaction.ts";

const SECRET = "sk-live-abcdef123456";

test("a secret is removed wherever it appears", () => {
  const url = `https://api.example.com/v1/data?api_key=${SECRET}&limit=20`;
  const safe = redact(url, SECRET);

  assert.ok(!safe.includes(SECRET));
  assert.ok(safe.includes(REDACTION_MARKER));
  assert.ok(safe.includes("limit=20"), "everything else survives");
});

test("every occurrence goes, not just the first", () => {
  const text = `${SECRET} appears twice: ${SECRET}`;
  const safe = redact(text, SECRET);

  assert.equal(safe, `${REDACTION_MARKER} appears twice: ${REDACTION_MARKER}`);
});

test("a value too short to be a key is never used as a pattern", () => {
  // Redacting "20" would turn "volume is up 20%" into nonsense, so a short
  // value is refused rather than allowed to shred unrelated text.
  assert.equal(redact("volume is up 20%", "20"), "volume is up 20%");
  assert.equal(redact("balance 1.5 SOL", "1.5"), "balance 1.5 SOL");
  assert.equal(isRedactable("short"), false);
  assert.equal(isRedactable(SECRET), true);
  assert.equal(MIN_REDACTABLE_LENGTH, 8);
});

test("several secrets are redacted longest first", () => {
  // A shorter secret contained inside a longer one must not partly redact it
  // and leave a fragment of the longer one behind.
  const long = "sk-live-abcdef123456";
  const short = "sk-live-";
  const safe = redactAll(`token ${long} end`, [short, long]);

  assert.ok(!safe.includes(long));
  assert.ok(!safe.includes("abcdef123456"), "no fragment survives");
});

test("a hint identifies a key without being usable as one", () => {
  assert.equal(hint(SECRET), "••••3456");
  assert.equal(hint("abc"), "••••", "a value too short to hint at is hidden entirely");
  assert.equal(hint(""), "••••");
  assert.ok(!hint(SECRET).includes("sk-live"), "the front of a key is never shown");
});

test("a final check catches anything about to be written down", () => {
  const url = `https://api.example.com/x?api_key=${SECRET}`;

  assert.equal(containsSecret(url, SECRET), true);
  assert.equal(containsSecret(redact(url, SECRET), SECRET), false);
  assert.equal(containsSecret("nothing here", SECRET), false);
});
