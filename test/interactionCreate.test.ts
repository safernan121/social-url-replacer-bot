import { PermissionFlagsBits, PermissionsBitField, type Interaction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { onInteractionCreate } from "../src/handlers/interactionCreate.js";
import { AUTHOR_ID, BOT_ID, OTHER_ID, makeContext } from "./helpers.js";

function makeButton(customId: string, userId: string, memberPermissions: bigint[] = [], botCanManage = true) {
  // The original message, currently with its embeds hidden.
  const original = {
    flags: { has: (flag: string) => flag === "SuppressEmbeds" },
    suppressEmbeds: vi.fn(async () => undefined),
  };
  const interaction = {
    customId,
    guildId: "100000000000000001",
    user: { id: userId },
    client: { user: { id: BOT_ID } },
    replied: false,
    deferred: false,
    isChatInputCommand: () => false,
    isButton: () => true,
    isRepliable: () => true,
    inGuild: () => true,
    memberPermissions: new PermissionsBitField(memberPermissions),
    guild: { members: { me: { id: BOT_ID } } },
    channel: {
      isDMBased: () => false,
      permissionsFor: () => new PermissionsBitField(botCanManage ? [PermissionFlagsBits.ManageMessages] : []),
      messages: { fetch: vi.fn(async () => original) },
    },
    message: {
      author: { id: BOT_ID },
      reference: { messageId: "100000000000000009" },
      delete: vi.fn(async () => undefined),
    },
    reply: vi.fn(async () => undefined),
    deferUpdate: vi.fn(async () => undefined),
  };
  return { interaction, original };
}

const run = (interaction: unknown) => onInteractionCreate(interaction as Interaction, makeContext());

describe("delete button", () => {
  it("lets the author delete the reply and restores the embed the bot hid", async () => {
    const { interaction, original } = makeButton(`del:${AUTHOR_ID}:s`, AUTHOR_ID);
    await run(interaction);
    expect(interaction.message.delete).toHaveBeenCalled();
    expect(original.suppressEmbeds).toHaveBeenCalledWith(false);
  });

  it("doesn't un-hide embeds the bot didn't hide", async () => {
    const { interaction, original } = makeButton(`del:${AUTHOR_ID}:n`, AUTHOR_ID);
    await run(interaction);
    expect(interaction.message.delete).toHaveBeenCalled();
    expect(original.suppressEmbeds).not.toHaveBeenCalled();
  });

  it("lets moderators delete", async () => {
    const { interaction } = makeButton(`del:${AUTHOR_ID}:n`, OTHER_ID, [PermissionFlagsBits.ManageMessages]);
    await run(interaction);
    expect(interaction.message.delete).toHaveBeenCalled();
  });

  it("refuses everyone else", async () => {
    const { interaction } = makeButton(`del:${AUTHOR_ID}:s`, OTHER_ID);
    await run(interaction);
    expect(interaction.message.delete).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it("ignores malformed IDs and other bots' messages", async () => {
    const malformed = makeButton(`del:${AUTHOR_ID}`, AUTHOR_ID).interaction;
    await run(malformed);
    expect(malformed.message.delete).not.toHaveBeenCalled();

    const foreign = makeButton(`del:${AUTHOR_ID}:n`, AUTHOR_ID).interaction;
    foreign.message.author.id = OTHER_ID;
    await run(foreign);
    expect(foreign.message.delete).not.toHaveBeenCalled();
  });
});
