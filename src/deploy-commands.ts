import { REST, Routes } from "discord.js";
import { fixlinksCommand } from "./commands/fixlinks.js";
import { loadEnv } from "./env.js";
import { logger, safeError } from "./logger.js";

/**
 * Registers the slash commands with Discord. Run once after setup and again
 * whenever the command definitions change.
 */
const env = loadEnv();
const rest = new REST().setToken(env.DISCORD_TOKEN);
const body = [fixlinksCommand.toJSON()];

try {
  if (env.DEV_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID), { body });
    logger.info({ guildId: env.DEV_GUILD_ID }, "Registered commands for the dev server (available immediately)");
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
    logger.info("Registered global commands (may take up to an hour to appear)");
  }
} catch (error) {
  logger.error({ err: safeError(error) }, "Failed to register commands");
  process.exitCode = 1;
}
