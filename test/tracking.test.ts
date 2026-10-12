import { describe, expect, it } from "vitest";
import { stripTrackingParams } from "../src/tracking.js";

const strip = (raw: string) => {
  const url = new URL(raw);
  return stripTrackingParams(url, url.hostname);
};

describe("stripTrackingParams", () => {
  it("removes share trackers per site", () => {
    expect(strip("https://x.com/a/status/1?s=46&t=abc")).toBe("");
    expect(strip("https://www.instagram.com/p/abc/?igsh=xyz&img_index=2")).toBe("?img_index=2");
    expect(strip("https://www.tiktok.com/@u/video/1?_r=1&_t=8abc&is_from_webapp=1")).toBe("");
    expect(strip("https://www.reddit.com/r/a/comments/b?share_id=1&context=3&utm_source=share")).toBe("?context=3");
  });

  it("keeps unknown parameters byte-for-byte", () => {
    expect(strip("https://x.com/search?q=a%20b+c&f=live")).toBe("?q=a%20b+c&f=live");
  });

  it("only strips site-specific keys on that site", () => {
    expect(strip("https://example.com/?s=1&t=2&fbclid=x")).toBe("?s=1&t=2");
  });
});
