import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import {
  MAX_FIXED_PER_MESSAGE,
  buildRuleSet,
  mightContainRuleDomain,
  resolveRules,
  rewriteContent,
  rewriteUrl,
} from "../src/rewrite.js";

const config = parseConfig(JSON.parse(readFileSync("config/rules.json", "utf8")));
const defaults = buildRuleSet(config.defaults);

describe("rewriteUrl with the default rules", () => {
  it.each([
    ["https://x.com/user/status/123", "https://vxtwitter.com/user/status/123"],
    ["https://twitter.com/user/status/123?s=20&t=abc", "https://vxtwitter.com/user/status/123"],
    ["https://www.instagram.com/p/abc/", "https://instagramez.com/p/abc/"],
    ["https://www.tiktok.com/@user/video/1", "https://vxtiktok.com/@user/video/1"],
    ["https://vm.tiktok.com/ZMabc/", "https://vm.vxtiktok.com/ZMabc/"],
    ["https://m.tiktok.com/v/1", "https://vxtiktok.com/v/1"],
    ["https://old.reddit.com/r/a/comments/b", "https://vxreddit.com/r/a/comments/b"],
    ["https://www.pixiv.net/en/artworks/1", "https://phixiv.net/en/artworks/1"],
    ["https://pixiv.com/artworks/1", "https://phixiv.net/artworks/1"],
    ["https://www.reddit.com/r/a/s/abc", "https://vxreddit.com/r/a/s/abc"],
    ["https://mobile.twitter.com/a", "https://vxtwitter.com/a"],
    ["http://x.com:8443/a#frag", "https://vxtwitter.com/a#frag"],
    ["https://X.COM./a", "https://vxtwitter.com/a"],
  ])("%s → %s", (input, expected) => {
    expect(rewriteUrl(input, defaults)).toBe(expected);
  });

  it.each([
    "https://evilx.com/a",
    "https://x.com.evil.com/a",
    "https://instagram.com.attacker.io/a",
    "https://notreddit.com/r/a",
    "https://fxtwitter.com/a",
    "https://help.x.com/en/rules",
    "https://about.instagram.com/blog",
    "https://ads.tiktok.com/a",
    "https://a.b.x.com/a",
    "https://vxtwitter.com/a",
    "https://help.x.com/en/rules",
    "https://about.instagram.com/blog",
    "https://ads.tiktok.com/a",
    "https://a.b.x.com/a",
    "https://example.com/?u=https://x.com/a",
    "https://user:pass@x.com/a",
    "javascript:alert(1)//x.com",
    "ftp://x.com/a",
    "not a url",
  ])("leaves %s alone", (input) => {
    expect(rewriteUrl(input, defaults)).toBeNull();
  });

  it("prefers the most specific rule", () => {
    const rules = buildRuleSet([
      { from: "example.com", to: "a.test" },
      { from: "media.example.com", to: "b.test" },
    ]);
    expect(rewriteUrl("https://media.example.com/x", rules)).toBe("https://b.test/x");
    expect(rewriteUrl("https://www.example.com/x", rules)).toBe("https://a.test/x");
  });
});

describe("rule conflicts", () => {
  it("a rule targeting another rule's domain doesn't disable that rule", () => {
    const rules = buildRuleSet([
      { from: "twitter.com", to: "x.com" },
      { from: "x.com", to: "vxtwitter.com" },
    ]);
    expect(rewriteUrl("https://x.com/a", rules)).toBe("https://vxtwitter.com/a");
  });

  it("rules can rewrite a replacement service's domain", () => {
    const rules = buildRuleSet([{ from: "vxtwitter.com", to: "fixupx.com" }]);
    expect(rewriteUrl("https://vxtwitter.com/a", rules)).toBe("https://fixupx.com/a");
  });
});

describe("rewriteContent", () => {
  it("only counts fixable links toward the cap", () => {
    const youtube = Array.from({ length: 10 }, (_, i) => `https://youtube.com/watch?v=${i}`).join(" ");
    expect(rewriteContent(`${youtube} https://x.com/a`, defaults)).toEqual(["https://vxtwitter.com/a"]);
    const tweets = Array.from({ length: 10 }, (_, i) => `https://x.com/${i}`).join(" ");
    expect(rewriteContent(tweets, defaults)).toHaveLength(MAX_FIXED_PER_MESSAGE);
  });

  it("handles a masked link whose text is the URL", () => {
    expect(rewriteContent("[https://x.com/a/status/1](https://x.com/a/status/1)", defaults)).toEqual([
      "https://vxtwitter.com/a/status/1",
    ]);
  });

  it("only returns rewritten links", () => {
    expect(rewriteContent("hi @everyone https://x.com/a and https://google.com", defaults)).toEqual([
      "https://vxtwitter.com/a",
    ]);
  });

  it("doesn't chain rules", () => {
    const rules = buildRuleSet([
      { from: "a.test", to: "b.test" },
      { from: "b.test", to: "c.test" },
    ]);
    expect(rewriteContent("https://a.test/x", rules)).toEqual(["https://b.test/x"]);
  });
});

describe("mightContainRuleDomain", () => {
  it("is a case-insensitive pre-check", () => {
    expect(mightContainRuleDomain("HTTPS://X.COM/a", defaults)).toBe(true);
    expect(mightContainRuleDomain("hello there", defaults)).toBe(false);
  });
});

describe("resolveRules", () => {
  it("applies disabled defaults and custom overrides", () => {
    const resolved = resolveRules(
      config.defaults,
      new Set(["reddit.com"]),
      [{ from: "x.com", to: "fixupx.com" }, { from: "bsky.app", to: "bskx.app" }],
    );
    const map = Object.fromEntries(resolved.map((r) => [r.from, r.to]));
    expect(map["reddit.com"]).toBeUndefined();
    expect(map["x.com"]).toBe("fixupx.com");
    expect(map["twitter.com"]).toBe("vxtwitter.com");
    expect(map["bsky.app"]).toBe("bskx.app");
  });
});
