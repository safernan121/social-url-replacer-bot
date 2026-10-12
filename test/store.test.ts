import { describe, expect, it } from "vitest";
import { Store } from "../src/store.js";

describe("Store", () => {
  const guild = "123456789012345678";

  it("returns defaults for an unknown guild", () => {
    const store = new Store(":memory:");
    expect(store.getGuildConfig(guild)).toEqual({
      enabled: true,
      mode: "reply_suppress",
      customRules: [],
      disabledDefaults: new Set(),
    });
  });

  it("persists settings and rules, and invalidates the cache", () => {
    const store = new Store(":memory:");
    store.getGuildConfig(guild); // warm the cache
    store.setEnabled(guild, false);
    store.setMode(guild, "reply");
    store.upsertRule(guild, { from: "x.com", to: "fixupx.com" });
    store.upsertRule(guild, { from: "x.com", to: "fxtwitter.com" });
    store.setDefaultDisabled(guild, "reddit.com", true);

    const config = store.getGuildConfig(guild);
    expect(config.enabled).toBe(false);
    expect(config.mode).toBe("reply");
    expect(config.customRules).toEqual([{ from: "x.com", to: "fxtwitter.com" }]);
    expect(config.disabledDefaults).toEqual(new Set(["reddit.com"]));

    expect(store.removeRule(guild, "x.com")).toBe(true);
    expect(store.removeRule(guild, "x.com")).toBe(false);
    store.setDefaultDisabled(guild, "reddit.com", false);
    expect(store.getGuildConfig(guild).disabledDefaults.size).toBe(0);
  });

  it("stores hostile strings as plain data", () => {
    const store = new Store(":memory:");
    const evil = "x.com'); DROP TABLE guild_rules; --";
    store.upsertRule(guild, { from: evil, to: "y.com" });
    expect(store.getGuildConfig(guild).customRules).toEqual([{ from: evil, to: "y.com" }]);
  });

  it("deletes everything for a guild", () => {
    const store = new Store(":memory:");
    store.setMode(guild, "reply");
    store.upsertRule(guild, { from: "x.com", to: "y.com" });
    store.setDefaultDisabled(guild, "reddit.com", true);
    store.deleteGuild(guild);
    expect(store.getGuildConfig(guild)).toEqual({
      enabled: true,
      mode: "reply_suppress",
      customRules: [],
      disabledDefaults: new Set(),
    });
  });
});
