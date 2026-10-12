import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("normalizes hosts and defaults to only allowing the default targets", () => {
    const config = parseConfig({ rules: [{ from: "X.com", to: "VXTwitter.com" }] });
    expect(config.defaults).toEqual([{ from: "x.com", to: "vxtwitter.com" }]);
    expect(config.policy).toEqual({
      maxCustomRulesPerGuild: 25,
      allowedCustomTargets: new Set(["vxtwitter.com"]),
    });
  });

  it("builds the allowed target set, including default targets", () => {
    const config = parseConfig({
      rules: [{ from: "x.com", to: "vxtwitter.com" }],
      policy: { maxCustomRulesPerGuild: 5, allowedCustomTargets: ["a.com"] },
    });
    expect(config.policy.allowedCustomTargets).toEqual(new Set(["a.com", "vxtwitter.com"]));
  });

  it("allows any target when explicitly null", () => {
    const config = parseConfig({ rules: [], policy: { maxCustomRulesPerGuild: 5, allowedCustomTargets: null } });
    expect(config.policy.allowedCustomTargets).toBeNull();
  });

  it.each([
    { rules: [{ from: "x.com/a", to: "y.com" }] },
    { rules: [{ from: "x.com", to: "x.com" }] },
    { rules: [{ from: "x.com", to: "a.com" }, { from: "x.com", to: "b.com" }] },
    { rules: [{ from: "x.com", to: "y.com", extra: true }] },
    { rules: [{ from: "twitter.com", to: "x.com" }, { from: "x.com", to: "vxtwitter.com" }] },
    { rules: [], policy: { maxCustomRulesPerGuild: -1 } },
    { rules: "nope" },
  ])("rejects invalid config %#", (raw) => {
    expect(() => parseConfig(raw)).toThrow();
  });
});
