import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  PermissionFlagsBits,
} from "discord.js";
import { effectiveRuleSet, type BotContext } from "../context.js";
import { logger, safeError } from "../logger.js";
import { mightContainRuleDomain, rewriteContent } from "../rewrite.js";

const MAX_REPLY_LENGTH = 1900;

/**
 * Delete button ID: `del:<authorId>:<s|n>`. `s` means the bot hid the original
 * message's embeds, so deleting the reply should un-hide them.
 */
export const DELETE_BUTTON_PREFIX = "del:";
export const DELETE_ID_RE = /^del:(\d{17,20}):([sn])$/;

export function deleteButtonId(authorId: string, suppressed: boolean): string {
  return `${DELETE_BUTTON_PREFIX}${authorId}:${suppressed ? "s" : "n"}`;
}

/** Keeps whole URLs only, so the reply stays under Discord's 2000-char limit. */
export function buildReply(urls: string[]): string {
  const kept: string[] = [];
  let length = 0;
  for (const url of urls) {
    if (length + url.length + 1 > MAX_REPLY_LENGTH) continue;
    kept.push(url);
    length += url.length + 1;
  }
  return kept.join("\n");
}

export async function onMessageCreate(message: Message, ctx: BotContext): Promise<void> {
  // Ignore DMs, bots (prevents bot-to-bot loops), webhooks and system messages.
  if (!message.inGuild() || message.author.bot || message.webhookId || message.system) return;

  const guildConfig = ctx.store.getGuildConfig(message.guildId);
  if (!guildConfig.enabled) return;

  // Cheap checks first, so ordinary chat and spam cost almost nothing.
  const ruleSet = effectiveRuleSet(ctx.config, guildConfig);
  if (!mightContainRuleDomain(message.content, ruleSet)) return;
  if (!ctx.rateLimiter.canConsume(message.author.id, message.channelId, message.guildId)) return;

  const me = message.guild.members.me;
  const permissions = me ? message.channel.permissionsFor(me) : null;
  if (!permissions) return;
  const sendPermission = message.channel.isThread()
    ? PermissionFlagsBits.SendMessagesInThreads
    : PermissionFlagsBits.SendMessages;
  // Without Embed Links the fixed link wouldn't show a preview, so there's no point replying.
  if (!permissions.has([PermissionFlagsBits.ViewChannel, sendPermission, PermissionFlagsBits.EmbedLinks])) return;

  const content = buildReply(rewriteContent(message.content, ruleSet));
  if (content.length === 0) return;
  if (!ctx.rateLimiter.consume(message.author.id, message.channelId, message.guildId)) return;

  const canReply = permissions.has(PermissionFlagsBits.ReadMessageHistory);
  // Only hide the original embed when the reply is linked to it, so the 🗑️ button can restore it.
  const suppress =
    guildConfig.mode === "reply_suppress" && canReply && permissions.has(PermissionFlagsBits.ManageMessages);

  try {
    const components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(deleteButtonId(message.author.id, suppress))
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
    // The bot only ever posts rewritten URLs, and never pings anyone.
    const allowedMentions = { parse: [], repliedUser: false };

    if (canReply) {
      await message.reply({ content, components, allowedMentions, failIfNotExists: false });
    } else {
      await message.channel.send({ content, components, allowedMentions });
    }

    if (suppress) await message.suppressEmbeds(true);
  } catch (error) {
    logger.warn({ err: safeError(error), guildId: message.guildId }, "Failed to post fixed link");
  }
}
