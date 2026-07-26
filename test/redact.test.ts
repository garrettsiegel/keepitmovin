import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact.js";

describe("redactSecrets", () => {
  const positives: Array<[string, string, string]> = [
    ["anthropic-key", "sk-ant-api03-AbCdEf0123456789ghIJKlMnOp", "anthropic-key"],
    ["openai-key", "sk-proj-AbCdEf0123456789ghIJKlMnOpqrST", "openai-key"],
    ["github-token", "ghp_AbCdEf0123456789ghIJKlMnOpqrStUv12", "github-token"],
    ["github-pat", "github_pat_11ABCDEF0123456789_abcdefghij", "github-pat"],
    ["aws-access-key", "AKIAIOSFODNN7EXAMPLE", "aws-access-key"],
    ["slack-token", "xoxb-123456789012-abcdefABCDEF", "slack-token"],
    ["bearer-token", "Bearer abcdef0123456789ABCDEF", "bearer-token"]
  ];

  it.each(positives)("redacts a %s", (_label, secret, kind) => {
    const out = redactSecrets(`token=${secret} end`);
    expect(out).toContain(`[REDACTED:${kind}]`);
    expect(out).not.toContain(secret);
    expect(out).toContain("token=");
    expect(out).toContain("end");
  });

  it("redacts a PEM private key block", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA0Z...fakekeymaterial...",
      "-----END RSA PRIVATE KEY-----"
    ].join("\n");
    const out = redactSecrets(`before\n${pem}\nafter`);
    expect(out).toContain("[REDACTED:private-key]");
    expect(out).not.toContain("fakekeymaterial");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("leaves lookalike words untouched (no false positives)", () => {
    const benign = "The skew was ghpage-worthy; a task reached AKIA status. Bearer of good news.";
    expect(redactSecrets(benign)).toBe(benign);
  });

  it("is idempotent", () => {
    const once = redactSecrets("key sk-ant-api03-AbCdEf0123456789ghIJKlMnOp done");
    expect(redactSecrets(once)).toBe(once);
  });
});

describe("redactSecrets — additional token shapes", () => {
  it.each([
    ["npm token", `npm_${"a".repeat(36)}`, "npm-token"],
    ["huggingface token", `hf_${"b".repeat(34)}`, "huggingface-token"],
    ["groq key", `gsk_${"c".repeat(40)}`, "groq-key"],
    ["xai key", `xai-${"d".repeat(40)}`, "xai-key"],
    ["openrouter key", `sk-or-v1-${"e".repeat(40)}`, "openrouter-key"],
    ["stripe live key", `sk_live_${"f".repeat(24)}`, "stripe-key"],
    ["sendgrid key", `SG.${"g".repeat(22)}.${"h".repeat(43)}`, "sendgrid-key"],
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"]
  ])("redacts a %s", (_name, secret) => {
    const output = redactSecrets(`the value is ${secret} ok`);
    expect(output).not.toContain(secret);
    expect(output).toContain("[REDACTED:");
  });

  it("redacts inline credentials in a connection string but keeps the host", () => {
    const output = redactSecrets("postgres://admin:hunter2@db.internal:5432/app");
    expect(output).not.toContain("hunter2");
    expect(output).toContain("db.internal:5432/app");
  });

  it("redacts a secret-shaped assignment the vendor rules don't know", () => {
    const output = redactSecrets('INTERNAL_API_TOKEN="a1b2c3d4e5f6g7h8"');
    expect(output).not.toContain("a1b2c3d4e5f6g7h8");
    expect(output).toContain("INTERNAL_API_TOKEN=");
  });

  it("leaves ordinary prose alone", () => {
    const prose = "We should rotate the token after the deploy finishes.";
    expect(redactSecrets(prose)).toBe(prose);
  });

  it("stays idempotent across the new rules", () => {
    const once = redactSecrets(`token: npm_${"a".repeat(36)} and postgres://u:p@h/db`);
    expect(redactSecrets(once)).toBe(once);
  });
});
