import { PermissionFlagsBits } from "discord.js";
import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import { buildReply, onMessageCreate } from "../src/handlers/messageCreate.js";
import { AUTHOR_ID, BASE_PERMISSIONS, GUILD_ID, makeContext, makeMessage } from "./helpers.js";

type Fake = ReturnType<typeof makeMessage>;
const run = (message: Fake, ctx = makeContext()) => onMessageCreate(message as unknown as Message, ctx);

function replyPayload(message: Fake) {
  const calls = message.reply.mock.calls as unknown as [Record<string, unknown>][];
  return calls[0]?.[0];
}

function buttonId(payload: Record<string, unknown> | undefined): string {
  const rows = payload?.components as { components: { data: { custom_id: string } }[] }[];
  return rows[0]?.components[0]?.data.custom_id ?? "";
}

describe("onMessageCreate", () => {
  it("replies with only the fixed links and never pings", async () => {
    const message = makeMessage("@everyone https://x.com/a/status/1?s=20 and https://google.com");
    await run(message);
    const payload = replyPayload(message);
    expect(payload?.content).toBe("https://vxtwitter.com/a/status/1");
    expect(payload?.allowedMentions).toEqual({ parse: [], repliedUser: false });
  });

  it("ignores bots, webhooks, system messages and DMs", async () => {
    for (const overrides of [
      { author: { id: AUTHOR_ID, bot: true } },
      { webhookId: "123" },
      { system: true },
      { inGuild: () => false },
    ]) {
      const message = makeMessage("https://x.com/a", BASE_PERMISSIONS, overrides);
      await run(message);
      expect(message.reply).not.toHaveBeenCalled();
    }
  });

  it("does nothing when disabled for the server", async () => {
    const ctx = makeContext();
    ctx.store.setEnabled(GUILD_ID, false);
    const message = makeMessage("https://x.com/a");
    await run(message, ctx);
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("does nothing without Embed Links or Send Messages", async () => {
    for (const missing of [PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.SendMessages]) {
      const message = makeMessage(
        "https://x.com/a",
        BASE_PERMISSIONS.filter((p) => p !== missing),
      );
      await run(message);
      expect(message.reply).not.toHaveBeenCalled();
      expect(message.channel.send).not.toHaveBeenCalled();
    }
  });

  it("hides the original embed only with Manage Messages, and records it in the button", async () => {
    const withManage = makeMessage("https://x.com/a", [...BASE_PERMISSIONS, PermissionFlagsBits.ManageMessages]);
    await run(withManage);
    expect(withManage.suppressEmbeds).toHaveBeenCalledWith(true);
    expect(buttonId(replyPayload(withManage))).toBe(`del:${AUTHOR_ID}:s`);

    const without = makeMessage("https://x.com/a");
    await run(without);
    expect(without.suppressEmbeds).not.toHaveBeenCalled();
    expect(buttonId(replyPayload(without))).toBe(`del:${AUTHOR_ID}:n`);
  });

  it("doesn't hide embeds in reply-only mode", async () => {
    const ctx = makeContext();
    ctx.store.setMode(GUILD_ID, "reply");
    const message = makeMessage("https://x.com/a", [...BASE_PERMISSIONS, PermissionFlagsBits.ManageMessages]);
    await run(message, ctx);
    expect(message.reply).toHaveBeenCalled();
    expect(message.suppressEmbeds).not.toHaveBeenCalled();
  });

  it("falls back to a plain message without Read Message History, and then never hides embeds", async () => {
    const message = makeMessage(
      "https://x.com/a",
      [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages],
    );
    await run(message);
    expect(message.reply).not.toHaveBeenCalled();
    expect(message.channel.send).toHaveBeenCalled();
    expect(message.suppressEmbeds).not.toHaveBeenCalled();
  });

  it("rate limits repeated links from the same user", async () => {
    const ctx = makeContext();
    const first = makeMessage("https://x.com/a");
    const second = makeMessage("https://x.com/b");
    await run(first, ctx);
    await run(second, ctx);
    expect(first.reply).toHaveBeenCalled();
    expect(second.reply).not.toHaveBeenCalled();
  });

  it("doesn't spend the rate limit on messages without fixable links", async () => {
    const ctx = makeContext();
    await run(makeMessage("https://help.x.com/rules"), ctx);
    const message = makeMessage("https://x.com/a");
    await run(message, ctx);
    expect(message.reply).toHaveBeenCalled();
  });

  it("survives Discord API errors", async () => {
    const message = makeMessage("https://x.com/a");
    message.reply.mockRejectedValueOnce(new Error("Missing Permissions"));
    await expect(run(message)).resolves.toBeUndefined();
  });
});

describe("buildReply", () => {
  it("keeps whole URLs under the length limit", () => {
    const long = `https://vxtwitter.com/${"a".repeat(1000)}`;
    const reply = buildReply([long, long + "b", "https://vxtwitter.com/short"]);
    expect(reply.length).toBeLessThanOrEqual(1900);
    expect(reply.split("\n")).toEqual([long, "https://vxtwitter.com/short"]);
  });
});
