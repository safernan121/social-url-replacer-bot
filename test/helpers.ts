import { readFileSync } from "node:fs";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { vi } from "vitest";
import { parseConfig } from "../src/config.js";
import { logger } from "../src/logger.js";
import type { BotContext } from "../src/context.js";
import { RateLimiter } from "../src/rateLimit.js";
import { Store } from "../src/store.js";

logger.level = "silent";

export const GUILD_ID = "100000000000000001";
export const CHANNEL_ID = "100000000000000002";
export const AUTHOR_ID = "100000000000000003";
export const BOT_ID = "100000000000000004";
export const OTHER_ID = "100000000000000005";

export function makeContext(): BotContext {
  return {
    config: parseConfig(JSON.parse(readFileSync("config/rules.json", "utf8"))),
    store: new Store(":memory:"),
    rateLimiter: new RateLimiter(),
  };
}

export const BASE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
];

/** A minimal stand-in for a discord.js Message, with only what the handler uses. */
export function makeMessage(content: string, botPermissions: bigint[] = BASE_PERMISSIONS, overrides = {}) {
  const sent = { reply: vi.fn(async () => undefined), send: vi.fn(async () => undefined) };
  const message = {
    content,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    webhookId: null,
    system: false,
    author: { id: AUTHOR_ID, bot: false },
    inGuild: () => true,
    guild: { members: { me: { id: BOT_ID } } },
    channel: {
      isThread: () => false,
      permissionsFor: () => new PermissionsBitField(botPermissions),
      send: sent.send,
    },
    reply: sent.reply,
    suppressEmbeds: vi.fn(async () => undefined),
    ...overrides,
  };
  return message;
}
