import { describe, expect, it } from "vitest";
import { MAX_CANDIDATE_URLS, extractUrls } from "../src/extract.js";

describe("extractUrls", () => {
  it("finds plain links, case-insensitively", () => {
    expect(extractUrls("look https://x.com/user/status/1 and HTTP://reddit.com/r/a")).toEqual([
      "https://x.com/user/status/1",
      "HTTP://reddit.com/r/a",
    ]);
  });

  it("trims trailing punctuation and unbalanced parens", () => {
    expect(extractUrls("(see https://x.com/a/status/1).")).toEqual(["https://x.com/a/status/1"]);
    expect(extractUrls("wow https://x.com/a!")).toEqual(["https://x.com/a"]);
    expect(extractUrls("**https://x.com/a**")).toEqual(["https://x.com/a"]);
    expect(extractUrls("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ]);
  });

  it("keeps a trailing underscore (usernames can end with one)", () => {
    expect(extractUrls("https://x.com/some_user_")).toEqual(["https://x.com/some_user_"]);
  });

  it("stops at markdown escapes and brackets", () => {
    expect(extractUrls("https://x.com/a\\_")).toEqual(["https://x.com/a"]);
    expect(extractUrls("[https://x.com/a/status/1](https://x.com/a/status/1)")).toEqual([
      "https://x.com/a/status/1",
    ]);
  });

  it("handles markdown masked links", () => {
    expect(extractUrls("[tweet](https://x.com/a/status/1)")).toEqual(["https://x.com/a/status/1"]);
  });

  it("ignores links the author hid or un-embedded", () => {
    expect(extractUrls("```\nhttps://x.com/a\n```")).toEqual([]);
    expect(extractUrls("`https://x.com/a`")).toEqual([]);
    expect(extractUrls("||https://x.com/a||")).toEqual([]);
    expect(extractUrls("<https://x.com/a>")).toEqual([]);
    expect(extractUrls("[tweet](<https://x.com/a>)")).toEqual([]);
  });

  it("deduplicates and caps the number of candidates", () => {
    expect(extractUrls("https://x.com/a https://x.com/a")).toEqual(["https://x.com/a"]);
    const many = Array.from({ length: 50 }, (_, i) => `https://x.com/${i}`).join(" ");
    expect(extractUrls(many)).toHaveLength(MAX_CANDIDATE_URLS);
  });

  it("ignores oversized messages", () => {
    expect(extractUrls(`https://x.com/a ${"a".repeat(5000)}`)).toEqual([]);
  });

  it("stays fast on paren-flooding input", () => {
    const evil = `https://a.b/${")".repeat(1985)} https://c.d/${")".repeat(1985)}`;
    const start = performance.now();
    for (let i = 0; i < 50; i++) extractUrls(evil);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
