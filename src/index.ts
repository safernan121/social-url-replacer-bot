import { Client, Events, GatewayIntentBits, Options } from "discord.js";
import { loadConfig } from "./config.js";
import type { BotContext } from "./context.js";
import { loadEnv } from "./env.js";
import { onInteractionCreate } from "./handlers/interactionCreate.js";
import { onMessageCreate } from "./handlers/messageCreate.js";
import { logger, safeError } from "./logger.js";
import { RateLimiter } from "./rateLimit.js";
import { Store } from "./store.js";

// Files the bot creates (database, WAL journal) are private to its user.
process.umask(0o077);

const env = loadEnv();
const config = loadConfig(env.RULES_PATH);
const store = new Store(env.DATABASE_PATH);
const ctx: BotContext = { config, store, rateLimiter: new RateLimiter() };

const client = new Client({
  // Only what the bot needs. MessageContent is privileged and must be enabled
  // in the Developer Portal.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  // Defense in depth: no message from this bot can ever ping anyone.
  allowedMentions: { parse: [], repliedUser: false },
  // Keep as little in memory as possible; the bot doesn't need message history.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    VoiceStateManager: 0,
    GuildMemberManager: { maxSize: 0, keepOverLimit: (member) => member.id === member.client.user.id },
  }),
});

client.once(Events.ClientReady, (ready) => {
  logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, "Bot is online");
  // Forget servers that removed the bot while it was offline.
  let removed = 0;
  for (const guildId of store.listGuildIds()) {
    if (!ready.guilds.cache.has(guildId)) {
      store.deleteGuild(guildId);
      removed++;
    }
  }
  if (removed > 0) logger.info({ removed }, "Deleted settings of servers the bot is no longer in");
});
client.on(Events.MessageCreate, (message) => {
  onMessageCreate(message, ctx).catch((error: unknown) =>
    logger.error({ err: safeError(error) }, "messageCreate handler failed"),
  );
});
client.on(Events.InteractionCreate, (interaction) => {
  onInteractionCreate(interaction, ctx).catch((error: unknown) =>
    logger.error({ err: safeError(error) }, "interactionCreate handler failed"),
  );
});
client.on(Events.GuildDelete, (guild) => {
  // Bot was removed from a server: forget its settings.
  if (guild.available) store.deleteGuild(guild.id);
});
client.on(Events.Error, (error) => logger.error({ err: safeError(error) }, "Client error"));

const sweepTimer = setInterval(() => ctx.rateLimiter.sweep(), 60_000);
sweepTimer.unref();

process.on("unhandledRejection", (reason) => logger.error({ err: safeError(reason) }, "Unhandled rejection"));

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  clearInterval(sweepTimer);
  await client.destroy();
  store.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);
