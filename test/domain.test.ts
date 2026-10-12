import { describe, expect, it } from "vitest";
import { hostMatches, validateRuleHost } from "../src/domain.js";

describe("validateRuleHost", () => {
  it.each([
    ["x.com", "x.com"],
    ["  VXTwitter.COM ", "vxtwitter.com"],
    ["sub.example.co.uk", "sub.example.co.uk"],
    ["example.com.", "example.com"],
    ["bücher.de", "xn--bcher-kva.de"],
  ])("accepts %j as %j", (input, expected) => {
    expect(validateRuleHost(input)).toEqual({ ok: true, host: expected });
  });

  it.each([
    "",
    "evil.com/path",
    "http://x.com",
    "https://example.com",
    "example.com:8080",
    "user@example.com",
    "a b.com",
    "*.example.com",
    "1.2.3.4",
    "0x7f.1",
    "2130706433",
    "[::1]",
    "localhost",
    "printer.local",
    "example",
    "-bad.com",
    "bad-.com",
    "exa_mple.com",
    "example.com?x=1",
    "example.com#frag",
    "<@everyone>.com",
    "||spoiler||.com",
    "`code`.com",
    `${"a".repeat(64)}.com`,
    `${"a.".repeat(130)}com`,
  ])("rejects %j", (input) => {
    expect(validateRuleHost(input).ok).toBe(false);
  });
});

describe("hostMatches", () => {
  it("matches the domain and its subdomains", () => {
    expect(hostMatches("x.com", "x.com")).toBe(true);
    expect(hostMatches("www.x.com", "x.com")).toBe(true);
    expect(hostMatches("mobile.twitter.com", "twitter.com")).toBe(true);
  });

  it("never matches by substring", () => {
    expect(hostMatches("evilx.com", "x.com")).toBe(false);
    expect(hostMatches("x.com.evil.com", "x.com")).toBe(false);
    expect(hostMatches("fxtwitter.com", "twitter.com")).toBe(false);
  });
});
