/**
 * Query parameters that only identify who shared a link or where it was
 * shared from. They're removed from rewritten links for privacy. Anything not
 * listed is kept, since it may be needed to open the right post.
 */
const ALWAYS_STRIP = new Set(["fbclid", "gclid", "igsh", "igshid", "mibextid", "ref_src", "ref_url", "rdt"]);
const STRIP_PREFIXES = ["utm_"];

const STRIP_BY_DOMAIN: Record<string, ReadonlySet<string>> = {
  "x.com": new Set(["s", "t"]),
  "twitter.com": new Set(["s", "t"]),
  "reddit.com": new Set(["share_id"]),
  "tiktok.com": new Set([
    "_r",
    "_t",
    "is_from_webapp",
    "is_copy_url",
    "sender_device",
    "sender_web_id",
    "share_app_id",
    "share_item_id",
    "share_link_id",
    "social_sharing",
    "source",
    "tt_from",
    "u_code",
    "user_id",
    "web_id",
    "checksum",
    "timestamp",
  ]),
};

/** Returns the query string (including `?`, or empty) without tracking parameters. */
export function stripTrackingParams(url: URL, host: string): string {
  const domainKey = Object.keys(STRIP_BY_DOMAIN).find((d) => host === d || host.endsWith(`.${d}`));
  const domainParams = domainKey ? STRIP_BY_DOMAIN[domainKey] : undefined;

  // Filter the raw pairs instead of re-serializing, so kept values stay byte-for-byte identical.
  const kept = url.search
    .slice(1)
    .split("&")
    .filter((pair) => {
      if (pair === "") return false;
      const key = (pair.split("=")[0] ?? "").toLowerCase();
      return !(
        ALWAYS_STRIP.has(key) ||
        STRIP_PREFIXES.some((p) => key.startsWith(p)) ||
        domainParams?.has(key)
      );
    });
  return kept.length > 0 ? `?${kept.join("&")}` : "";
}
