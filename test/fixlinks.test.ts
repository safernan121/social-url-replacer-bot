import { PermissionFlagsBits, PermissionsBitField, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { handleFixlinks } from "../src/commands/fixlinks.js";
import type { BotContext } from "../src/context.js";
import { parseConfig } from "../src/config.js";
import { GUILD_ID, OTHER_ID, makeContext } from "./helpers.js";

function makeCommand(
  sub: string,
  options: Record<string, string | boolean> = {},
  { group = null as string | null, permissions = [PermissionFlagsBits.ManageGuild] } = {},
) {
  return {
    guildId: GUILD_ID,
    user: { id: OTHER_ID },
    inGuild: () => true,
    memberPermissions: new PermissionsBitField(permissions),
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => sub,
      getString: (name: string) => options[name] as string,
      getBoolean: (name: string) => options[name] as boolean,
    },
    reply: vi.fn<(payload: { content: string }) => Promise<void>>(async () => undefined),
  };
}

async function run(command: ReturnType<typeof makeCommand>, ctx: BotContext = makeContext()) {
  await handleFixlinks(command as unknown as ChatInputCommandInteraction, ctx);
  return command.reply.mock.calls[0]?.[0].content ?? "";
}

describe("/fixlinks", () => {
  it("requires Manage Server even if Discord's command permissions were changed", async () => {
    const ctx = makeContext();
    const reply = await run(makeCommand("add", { from: "bsky.app", to: "fxbsky.app" }, { permissions: [] }), ctx);
    expect(reply).toMatch(/Manage Server/);
    expect(ctx.store.getGuildConfig(GUILD_ID).customRules).toEqual([]);
  });

  it("adds a rule to an allowed target", async () => {
    const ctx = makeContext();
    const reply = await run(makeCommand("add", { from: "BSKY.app", to: "fxbsky.app" }), ctx);
    expect(reply).toMatch(/✅/);
    expect(ctx.store.getGuildConfig(GUILD_ID).customRules).toEqual([{ from: "bsky.app", to: "fxbsky.app" }]);
  });

  it("rejects targets outside the owner's allowlist", async () => {
    const ctx = makeContext();
    const reply = await run(makeCommand("add", { from: "x.com", to: "evil-logger.com" }), ctx);
    expect(reply).toMatch(/only allows/);
    expect(ctx.store.getGuildConfig(GUILD_ID).customRules).toEqual([]);
  });

  it("rejects internationalized look-alike targets even when any target is allowed", async () => {
    const ctx = makeContext();
    ctx.config = parseConfig({ rules: [], policy: { maxCustomRulesPerGuild: 5, allowedCustomTargets: null } });
    const reply = await run(makeCommand("add", { from: "x.com", to: "аррӏе.com" }), ctx);
    expect(reply).toMatch(/Internationalized/);
  });

  it("rejects a target that another rule would rewrite", async () => {
    const ctx = makeContext();
    ctx.config = parseConfig({
      rules: [{ from: "x.com", to: "vxtwitter.com" }],
      policy: { maxCustomRulesPerGuild: 5, allowedCustomTargets: null },
    });
    const reply = await run(makeCommand("add", { from: "twitter.com", to: "x.com" }), ctx);
    expect(reply).toMatch(/itself replaced/);
  });

  it("rejects invalid domains", async () => {
    const reply = await run(makeCommand("add", { from: "https://x.com/a", to: "fxtwitter.com" }));
    expect(reply).toMatch(/❌/);
  });

  it("enforces the per-server rule limit", async () => {
    const ctx = makeContext();
    ctx.config.policy.maxCustomRulesPerGuild = 1;
    await run(makeCommand("add", { from: "a.com", to: "fxtwitter.com" }), ctx);
    const reply = await run(makeCommand("add", { from: "b.com", to: "fxtwitter.com" }), ctx);
    expect(reply).toMatch(/maximum/);
    // Overriding an existing rule still works at the limit.
    expect(await run(makeCommand("add", { from: "a.com", to: "fixupx.com" }), ctx)).toMatch(/✅/);
  });

  it("removes custom rules and hints about built-in ones", async () => {
    const ctx = makeContext();
    await run(makeCommand("add", { from: "x.com", to: "fixupx.com" }), ctx);
    expect(await run(makeCommand("remove", { from: "x.com" }), ctx)).toMatch(/built-in rule for it applies again/);
    expect(await run(makeCommand("remove", { from: "x.com" }), ctx)).toMatch(/default disable/);
  });

  it("disables and re-enables built-in rules", async () => {
    const ctx = makeContext();
    await run(makeCommand("disable", { from: "reddit.com" }, { group: "default" }), ctx);
    expect(ctx.store.getGuildConfig(GUILD_ID).disabledDefaults.has("reddit.com")).toBe(true);
    await run(makeCommand("enable", { from: "reddit.com" }, { group: "default" }), ctx);
    expect(ctx.store.getGuildConfig(GUILD_ID).disabledDefaults.has("reddit.com")).toBe(false);
    expect(await run(makeCommand("disable", { from: "bsky.app" }, { group: "default" }), ctx)).toMatch(/not a built-in/);
  });

  it("sets mode, toggles and resets", async () => {
    const ctx = makeContext();
    await run(makeCommand("mode", { value: "reply" }), ctx);
    await run(makeCommand("toggle", { enabled: false }), ctx);
    expect(ctx.store.getGuildConfig(GUILD_ID)).toMatchObject({ mode: "reply", enabled: false });
    expect(await run(makeCommand("mode", { value: "webhook" }), ctx)).toMatch(/Unknown mode/);
    await run(makeCommand("reset"), ctx);
    expect(ctx.store.getGuildConfig(GUILD_ID)).toMatchObject({ mode: "reply_suppress", enabled: true });
  });

  it("lists rules", async () => {
    const reply = await run(makeCommand("list"));
    expect(reply).toMatch(/x\.com/);
    expect(reply).toMatch(/Custom rules/);
  });
});
