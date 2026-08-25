import assert from "node:assert/strict";
import test from "node:test";

import {
  FINDING_LIMITS,
  checkFindingLink,
  cleanFinding,
  cleanFindings,
  describeLink,
} from "../packages/contracts/src/run-findings.ts";

const good = {
  label: "Catecoin (CATE)",
  detail: "h24 volume $12.4M against $1.89M liquidity — an unusually low ratio for this venue.",
  action: "Treat as the most credible mover in the set; genuine volume against real depth.",
  link: "https://dexscreener.com/solana/8wa7x9ewdfvkikqrecmr3omwljmaqks2csjxw1pws7dh",
};

test("a complete finding keeps its link and carries the host separately", () => {
  const finding = cleanFinding(good)!;

  assert.equal(finding.label, good.label);
  assert.equal(finding.link, good.link);
  assert.equal(finding.host, "dexscreener.com", "the destination travels with the link");
});

test("a link that is not https is dropped, and the finding survives without it", () => {
  const finding = cleanFinding({ ...good, link: "http://dexscreener.com/solana/abc" })!;

  assert.equal(finding.link, null);
  assert.equal(finding.host, null);
  assert.equal(finding.label, good.label, "a bad link does not discard the finding");
});

test("a link carrying credentials is refused", () => {
  // Credentials in a URL are a classic way to dress one destination as another.
  const check = checkFindingLink("https://dexscreener.com:x@evil.example/phish");

  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.reason, "has_credentials");
});

test("junk that is not a URL is refused rather than rendered", () => {
  assert.equal(checkFindingLink("javascript:alert(1)").ok, false);
  assert.equal(checkFindingLink("not a url at all").ok, false);
  assert.equal(checkFindingLink("").ok, false);
  assert.equal(checkFindingLink(undefined).ok, false);
});

test("a finding without a label or detail is noise and is dropped", () => {
  assert.equal(cleanFinding({ ...good, label: "" }), null);
  assert.equal(cleanFinding({ ...good, detail: "   " }), null);
  assert.equal(cleanFinding(null), null);
  assert.equal(cleanFinding("a string"), null);
});

test("an action is optional, because sometimes nothing needs doing", () => {
  const finding = cleanFinding({ ...good, action: "" })!;

  assert.equal(finding.action, "");
  assert.equal(finding.label, good.label);
});

test("findings are bounded and malformed entries skipped", () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ ...good, label: `Token ${index}` }));
  const withJunk = [null, ...many, "nonsense"];

  const kept = cleanFindings(withJunk);
  assert.equal(kept.length, FINDING_LIMITS.maxFindings);
  assert.equal(cleanFindings("not an array").length, 0);
});

test("long text is trimmed rather than rejected", () => {
  const finding = cleanFinding({ ...good, detail: "x".repeat(500) })!;

  assert.equal(finding.detail.length, FINDING_LIMITS.detail);
});

test("a link is only offered for display alongside its host", () => {
  assert.deepEqual(describeLink(cleanFinding(good)!), {
    href: good.link,
    host: "dexscreener.com",
  });
  assert.equal(describeLink(cleanFinding({ ...good, link: "ftp://x.example" })!), null);
});
