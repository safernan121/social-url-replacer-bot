import {
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { effectiveRuleSet, type BotContext } from "../context.js";
import { validateRuleHost } from "../domain.js";
import { logger } from "../logger.js";
import { buildRuleSet, ruleSetMatchesHost } from "../rewrite.js";
import { REPLY_MODES, type ReplyMode } from "../store.js";

export const fixlinksCommand = new SlashCommandBuilder()
  .setName("fixlinks")
  .setDescription("Configure social link replacement for this server")
  // Hidden from members without Manage Server by default. Server admins can
  // change this in Server Settings → Integrations, so handlers re-check it too.
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) => sub.setName("list").setDescription("Show the active rules and settings"))
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add or override a replacement rule")
      .addStringOption((o) =>
        o.setName("from").setDescription("Domain to replace, e.g. example.com").setRequired(true).setMaxLength(253),
      )
      .addStringOption((o) =>
        o.setName("to").setDescription("Replacement domain, e.g. fxexample.com").setRequired(true).setMaxLength(253),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a custom rule added with /fixlinks add")
      .addStringOption((o) =>
        o.setName("from").setDescription("Domain of the rule to remove").setRequired(true).setMaxLength(253),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("default")
      .setDescription("Turn built-in rules on or off for this server")
      .addSubcommand((sub) =>
        sub
          .setName("disable")
          .setDescription("Turn off a built-in rule")
          .addStringOption((o) =>
            o.setName("from").setDescription("Domain of the built-in rule").setRequired(true).setMaxLength(253),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("enable")
          .setDescription("Turn a built-in rule back on")
          .addStringOption((o) =>
            o.setName("from").setDescription("Domain of the built-in rule").setRequired(true).setMaxLength(253),
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("mode")
      .setDescription("Choose how the bot posts fixed links")
      .addStringOption((o) =>
        o
          .setName("value")
          .setDescription("Reply mode")
          .setRequired(true)
          .addChoices(
            { name: "Reply only", value: "reply" },
            { name: "Reply and hide the original embed (needs Manage Messages)", value: "reply_suppress" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("toggle")
      .setDescription("Turn the bot on or off in this server")
      .addBooleanOption((o) => o.setName("enabled").setDescription("Whether links are fixed").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("reset").setDescription("Delete all of this server's custom settings"));

async function respond(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

export async function handleFixlinks(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void> {
  if (!interaction.inGuild()) {
    await respond(interaction, "This command only works in servers.");
    return;
  }
  // Never rely only on Discord's default command permissions.
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await respond(interaction, "You need the **Manage Server** permission to use this command.");
    return;
  }

  const { config, store } = ctx;
  const guildId = interaction.guildId;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(true);
  const defaultFroms = new Set(config.defaults.map((r) => r.from));
  // Audit trail for configuration changes: IDs and domains only, never message content.
  const audit = (action: string, details: Record<string, unknown> = {}) =>
    logger.info({ guildId, userId: interaction.user.id, action, ...details }, "Server settings changed");

  if (group === "default") {
    const parsed = validateRuleHost(interaction.options.getString("from", true));
    if (!parsed.ok) return respond(interaction, `❌ ${parsed.reason}`);
    if (!defaultFroms.has(parsed.host)) {
      return respond(interaction, `❌ \`${parsed.host}\` is not a built-in rule. See \`/fixlinks list\`.`);
    }
    const disable = sub === "disable";
    store.setDefaultDisabled(guildId, parsed.host, disable);
    audit(disable ? "default.disable" : "default.enable", { from: parsed.host });
    return respond(interaction, `✅ Built-in rule for \`${parsed.host}\` ${disable ? "disabled" : "enabled"}.`);
  }

  switch (sub) {
    case "list":
      return respond(interaction, renderList(ctx, guildId));

    case "add": {
      const from = validateRuleHost(interaction.options.getString("from", true));
      if (!from.ok) return respond(interaction, `❌ \`from\`: ${from.reason}`);
      const to = validateRuleHost(interaction.options.getString("to", true));
      if (!to.ok) return respond(interaction, `❌ \`to\`: ${to.reason}`);
      if (from.host === to.host) return respond(interaction, "❌ `from` and `to` must be different.");
      // Internationalized domains can imitate well-known ones (e.g. Cyrillic "аррӏе.com").
      if (to.host.split(".").some((label) => label.startsWith("xn--"))) {
        return respond(interaction, "❌ Internationalized domains aren't allowed as replacement targets.");
      }

      const allowed = config.policy.allowedCustomTargets;
      if (allowed && !allowed.has(to.host)) {
        return respond(
          interaction,
          `❌ The bot owner only allows these replacement domains: ${[...allowed].map((d) => `\`${d}\``).join(", ")}`,
        );
      }

      const guild = store.getGuildConfig(guildId);
      const otherRules = effectiveRuleSet(config, guild).rules.filter((r) => r.from !== from.host);
      if (ruleSetMatchesHost(buildRuleSet(otherRules), to.host)) {
        return respond(
          interaction,
          `❌ \`${to.host}\` is itself replaced by another rule, so fixed links would still be broken. Pick a replacement service instead.`,
        );
      }

      const isNew = !guild.customRules.some((r) => r.from === from.host);
      if (isNew && guild.customRules.length >= config.policy.maxCustomRulesPerGuild) {
        return respond(
          interaction,
          `❌ This server already has the maximum of ${config.policy.maxCustomRulesPerGuild} custom rules.`,
        );
      }

      store.upsertRule(guildId, { from: from.host, to: to.host });
      audit("rule.add", { from: from.host, to: to.host });
      return respond(interaction, `✅ \`${from.host}\` links will now be replaced with \`${to.host}\`.`);
    }

    case "remove": {
      const from = validateRuleHost(interaction.options.getString("from", true));
      if (!from.ok) return respond(interaction, `❌ ${from.reason}`);
      if (store.removeRule(guildId, from.host)) {
        audit("rule.remove", { from: from.host });
        const note = defaultFroms.has(from.host) ? " The built-in rule for it applies again." : "";
        return respond(interaction, `✅ Removed the custom rule for \`${from.host}\`.${note}`);
      }
      const hint = defaultFroms.has(from.host) ? " To turn off a built-in rule, use `/fixlinks default disable`." : "";
      return respond(interaction, `❌ No custom rule for \`${from.host}\`.${hint}`);
    }

    case "mode": {
      const value = interaction.options.getString("value", true);
      if (!REPLY_MODES.includes(value as ReplyMode)) return respond(interaction, "❌ Unknown mode.");
      store.setMode(guildId, value as ReplyMode);
      audit("mode", { mode: value });
      const note =
        value === "reply_suppress"
          ? " The bot needs **Manage Messages** in a channel to hide embeds there; without it, it just replies."
          : "";
      return respond(interaction, `✅ Mode set to \`${value}\`.${note}`);
    }

    case "toggle": {
      const enabled = interaction.options.getBoolean("enabled", true);
      store.setEnabled(guildId, enabled);
      audit("toggle", { enabled });
      return respond(interaction, enabled ? "✅ Link fixing is **on**." : "✅ Link fixing is **off**.");
    }

    case "reset":
      store.deleteGuild(guildId);
      audit("reset");
      return respond(interaction, "✅ All custom settings for this server were deleted. Defaults apply again.");

    default:
      return respond(interaction, "❌ Unknown subcommand.");
  }
}

function renderList(ctx: BotContext, guildId: string): string {
  const guild = ctx.store.getGuildConfig(guildId);
  const overridden = new Set(guild.customRules.map((r) => r.from));

  const lines = [
    `**Status:** ${guild.enabled ? "on" : "off"} · **Mode:** \`${guild.mode}\``,
    "",
    "**Built-in rules**",
    ...ctx.config.defaults.map((r) => {
      const state = guild.disabledDefaults.has(r.from) ? " (disabled)" : overridden.has(r.from) ? " (overridden)" : "";
      return `• \`${r.from}\` → \`${r.to}\`${state}`;
    }),
    "",
    `**Custom rules** (${guild.customRules.length}/${ctx.config.policy.maxCustomRulesPerGuild})`,
    ...(guild.customRules.length > 0
      ? guild.customRules.map((r) => `• \`${r.from}\` → \`${r.to}\``)
      : ["None. Add one with `/fixlinks add`."]),
  ];
  const text = lines.join("\n");
  return text.length > 1900 ? `${text.slice(0, 1900)}\n…` : text;
}
