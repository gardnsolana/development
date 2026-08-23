import assert from "node:assert/strict";
import test from "node:test";

import {
  ENDPOINT_LIMITS,
  ENDPOINT_METRICS,
  checkEndpointTarget,
  contentChanged,
  isBlockedIpv4,
  isBlockedIpv6,
  isReadableEndpoint,
} from "../packages/contracts/src/endpoint-target.ts";

test("accepts a public https endpoint", () => {
  const result = checkEndpointTarget("https://api.example.com/v1/status?range=24h");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.host, "api.example.com");
});

test("only https is readable", () => {
  for (const value of ["http://example.com", "ftp://example.com", "file:///etc/passwd", "data:text/plain,hi"]) {
    const result = checkEndpointTarget(value);
    assert.equal(result.ok, false, `${value} must be rejected`);
    if (result.ok) continue;
    assert.equal(result.reason, value.startsWith("http://") ? "scheme_not_https" : result.reason);
  }
});

test("rejects URLs carrying credentials", () => {
  const result = checkEndpointTarget("https://user:secret@example.com/");

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "credentials_in_url");
});

test("rejects hosts that are not publicly routable", () => {
  const blocked = [
    "https://localhost/admin",
    "https://metadata.google.internal/",
    "https://console.internal/",
    "https://printer.local/",
  ];
  for (const value of blocked) {
    const result = checkEndpointTarget(value);
    assert.equal(result.ok, false, `${value} must be blocked`);
    if (result.ok) continue;
    assert.equal(result.reason, "host_not_public");
  }
});

test("rejects loopback, private, link-local and metadata addresses", () => {
  const blocked = [
    "https://127.0.0.1/",
    "https://10.0.0.5/",
    "https://192.168.1.1/",
    "https://172.16.0.9/",
    "https://172.31.255.254/",
    "https://169.254.169.254/latest/meta-data/",
    "https://100.64.0.1/",
    "https://[::1]/",
    "https://[fd00::1]/",
    "https://[fe80::1]/",
  ];
  for (const value of blocked) {
    const result = checkEndpointTarget(value);
    assert.equal(result.ok, false, `${value} must be blocked`);
    if (result.ok) continue;
    assert.equal(result.reason, "address_not_public");
  }
});

test("public addresses that resemble private ranges stay readable", () => {
  for (const value of ["https://172.32.0.1/", "https://172.15.0.1/", "https://11.0.0.1/", "https://193.168.1.1/"]) {
    assert.equal(isReadableEndpoint(value), true, `${value} should be allowed`);
  }
});

test("ipv4 range checks do not misread malformed hosts", () => {
  assert.equal(isBlockedIpv4("10.0.0.5"), true);
  assert.equal(isBlockedIpv4("10.0.0"), false);
  assert.equal(isBlockedIpv4("10.0.0.256"), false);
  assert.equal(isBlockedIpv4("example.com"), false);
  assert.equal(isBlockedIpv6("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIpv6("2606:4700::1111"), false);
});

test("a first run reports no change, and change is measured against a baseline", () => {
  assert.equal(contentChanged("hash-a", null), false);
  assert.equal(contentChanged("hash-a", undefined), false);
  assert.equal(contentChanged("hash-a", "hash-a"), false);
  assert.equal(contentChanged("hash-b", "hash-a"), true);
});

test("endpoint reads are bounded", () => {
  assert.equal(ENDPOINT_METRICS.length, 4);
  assert.ok(ENDPOINT_LIMITS.requestTimeoutMs <= 15_000);
  assert.ok(ENDPOINT_LIMITS.maxBodyBytes <= 128 * 1024);
  assert.ok(ENDPOINT_LIMITS.maxRedirects <= 3);
});

test("an endpoint agent validates through the shared definition contract", async () => {
  const { validateAgentDefinition } = await import("../packages/contracts/src/agent-definition.ts");

  const result = validateAgentDefinition({
    name: "Status watch",
    objective: "Read this status endpoint and tell me when it stops returning a healthy response.",
    mode: "alert",
    schedule: "Every 5 minutes",
    targetKind: "endpoint",
    targetAddress: "https://api.example.com/health",
    spendLimitCents: 0,
    sources: ["Web endpoint"],
    rules: [{ id: "reachable", metric: "http_status", operator: "eq", value: 200 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.targetKind, "endpoint");
});

test("on-chain metrics are refused on an endpoint target, and the reverse", async () => {
  const { validateAgentDefinition } = await import("../packages/contracts/src/agent-definition.ts");
  const base = {
    name: "Mixed target",
    objective: "Check something measurable about this target.",
    mode: "alert",
    schedule: "Manual",
    spendLimitCents: 0,
    sources: ["Web endpoint"],
  };

  const onChainOnEndpoint = validateAgentDefinition({
    ...base,
    targetKind: "endpoint",
    targetAddress: "https://api.example.com/health",
    rules: [{ id: "bad", metric: "sol_balance", operator: "lt", value: 1 }],
  });
  assert.equal(onChainOnEndpoint.ok, false);

  const endpointOnWallet = validateAgentDefinition({
    ...base,
    targetKind: "wallet",
    targetAddress: "11111111111111111111111111111111",
    rules: [{ id: "bad", metric: "http_status", operator: "eq", value: 200 }],
  });
  assert.equal(endpointOnWallet.ok, false);
});

test("a private endpoint is refused as a target address", async () => {
  const { validateAgentDefinition } = await import("../packages/contracts/src/agent-definition.ts");

  const result = validateAgentDefinition({
    name: "Metadata probe",
    objective: "Read the cloud metadata endpoint and report what it returns.",
    mode: "alert",
    schedule: "Manual",
    targetKind: "endpoint",
    targetAddress: "https://169.254.169.254/latest/meta-data/",
    spendLimitCents: 0,
    sources: ["Web endpoint"],
    rules: [{ id: "reachable", metric: "http_status", operator: "eq", value: 200 }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.code === "invalid_address"));
});
