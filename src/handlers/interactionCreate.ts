import {
  type ButtonInteraction,
  type Interaction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { handleFixlinks } from "../commands/fixlinks.js";
import type { BotContext } from "../context.js";
import { logger, safeError } from "../logger.js";
import { DELETE_BUTTON_PREFIX, DELETE_ID_RE } from "./messageCreate.js";

export async function onInteractionCreate(interaction: Interaction, ctx: BotContext): Promise<void> {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "fixlinks") {
      await handleFixlinks(interaction, ctx);
    } else if (interaction.isButton() && interaction.customId.startsWith(DELETE_BUTTON_PREFIX)) {
      await handleDeleteButton(interaction);
    }
  } catch (error) {
    logger.warn({ err: safeError(error), guildId: interaction.guildId }, "Interaction failed");
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }
  }
}

/** Lets the person who posted the link (or a moderator) remove the bot's reply. */
async function handleDeleteButton(interaction: ButtonInteraction): Promise<void> {
  const match = DELETE_ID_RE.exec(interaction.customId);
  const isOwnMessage = interaction.message.author.id === interaction.client.user.id;
  if (!match || !isOwnMessage || !interaction.inGuild()) return;

  const authorId = match[1];
  const isModerator = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
  if (interaction.user.id !== authorId && !isModerator) {
    await interaction.reply({
      content: "Only the person who posted the link (or a moderator) can remove this.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  // Only undo a suppression the bot itself made, never one a moderator made.
  if (match[2] === "s") await restoreOriginalEmbed(interaction);
  await interaction.message.delete();
}

/** Best effort: un-hide the original message's embed. */
async function restoreOriginalEmbed(interaction: ButtonInteraction): Promise<void> {
  const referenceId = interaction.message.reference?.messageId;
  const channel = interaction.channel;
  const me = interaction.guild?.members.me;
  if (!referenceId || !channel || channel.isDMBased() || !me) return;
  if (!channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages)) return;

  try {
    const original = await channel.messages.fetch(referenceId);
    if (original.flags.has("SuppressEmbeds")) await original.suppressEmbeds(false);
  } catch {
    // The original message may have been deleted already.
  }
}
