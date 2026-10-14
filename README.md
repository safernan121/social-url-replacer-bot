# Social URL Replacer Bot

A small, security-focused Discord bot that replies to social media links with
embed-friendly versions, so posts from X/Twitter, Instagram, TikTok, Reddit
and Pixiv show proper previews in Discord.

```
You:  https://x.com/someone/status/123
Bot:  https://vxtwitter.com/someone/status/123   [🗑️]
```

Server admins can add their own replacement rules, turn built-in ones off, and
choose whether the bot also hides the original (broken) embed.

> **This is a self-hosted bot.** There's no shared public instance. You create
> your own Discord bot application, run this code, and invite it to your own
> server(s). It takes about 10 minutes.

## Contents

- [Built-in rules](#built-in-rules)
- [1. Create your bot application](#1-create-your-bot-application)
- [2. Invite the bot to your server](#2-invite-the-bot-to-your-server)
- [3. Run the bot](#3-run-the-bot)
- [4. Register the slash commands](#4-register-the-slash-commands)
- [5. Configure it](#5-configure-it)
- [Security](#security)
- [Tips for first-time bot hosts](#tips-for-first-time-bot-hosts)
- [Health check](#health-check)
- [Updating](#updating)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Built-in rules

| Original domain | Replaced with     |
| --------------- | ----------------- |
| `x.com`         | `vxtwitter.com`   |
| `twitter.com`   | `vxtwitter.com`   |
| `instagram.com` | `instagramez.com` |
| `tiktok.com`    | `vxtiktok.com`    |
| `reddit.com`    | `vxreddit.com`    |
| `pixiv.net`     | `phixiv.net`      |
| `pixiv.com`     | `phixiv.net`      |

These common subdomains are included: `www.`, `m.`, `mobile.`, `old.` and
`new.` (e.g. `mobile.twitter.com` → `vxtwitter.com`), plus the short-link hosts
`vm.` and `vt.` (`vm.tiktok.com` → `vm.vxtiktok.com`). Other subdomains, like
`help.x.com` or `about.instagram.com`, are different sites and are left alone.
Lookalike domains such as `evilx.com` or `x.com.evil.com` are **never** matched.

Tracking parameters that identify who shared a link (`?s=…&t=…` on X,
`?igsh=…` on Instagram, `utm_*`, TikTok share IDs, and so on) are removed from
the fixed link. Up to 5 links are fixed per message.

The bot leaves links alone when the author deliberately hid them or turned off
their embed:

- links in code blocks or `` `inline code` ``
- links inside `||spoilers||`
- links wrapped in `<angle brackets>`

---

## 1. Create your bot application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Give it a name.
2. In **General Information**, copy the **Application ID**. You'll need it as `DISCORD_CLIENT_ID`.
3. Open the **Bot** tab:
   - Click **Reset Token** and copy the token. You'll need it as `DISCORD_TOKEN`.
     **Treat it like a password.** Anyone with it controls your bot.
   - Under **Privileged Gateway Intents**, enable **Message Content Intent**.
     Without it the bot can't see links in messages.
   - Optional but recommended: turn **Public Bot** off, so only you can invite it.
   - Leave **Requires OAuth2 Code Grant** off.

## 2. Invite the bot to your server

Build an invite link in **OAuth2 → URL Generator**:

- **Scopes:** `bot` and `applications.commands`
- **Bot permissions:**
  - View Channels
  - Send Messages
  - Send Messages in Threads
  - Read Message History
  - Embed Links
  - *(Optional)* Manage Messages. Only needed for the "hide original embed" mode.

Or use one of these links, replacing `YOUR_CLIENT_ID` with your Application ID:

- **Recommended** (includes Manage Messages, so it can hide the original embed):
  `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=274878000128`
- **Minimal** (reply only):
  `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=274877991936`

Never give the bot **Administrator**. It doesn't need it.

## 3. Run the bot

First, clone the repository and create your config:

```sh
git clone https://github.com/<you>/social-url-replacer-bot.git
cd social-url-replacer-bot
cp .env.example .env
```

Open `.env` and fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. While testing,
also set `DEV_GUILD_ID` to your server's ID (enable **Developer Mode** in
Discord's Advanced settings, then right-click the server icon → **Copy Server ID**).

Then choose one of the two options below.

### Option A: Docker (recommended for running 24/7)

Docker isn't required, but it's the easiest way to keep the bot running. It
also isolates the bot: the container runs as a non-root user with a read-only
filesystem and no extra privileges, so even a compromised dependency couldn't
touch the rest of your machine. It also restarts the bot automatically after
crashes or reboots.

Requires [Docker](https://docs.docker.com/get-docker/) with Compose.

```sh
docker compose up -d --build
docker compose run --rm bot node dist/deploy-commands.js   # register slash commands (see step 4)
docker compose logs -f                                     # check it's online
```

Settings are stored in a Docker volume (`bot-data`), so they survive rebuilds.

`docker compose ps` shows whether the bot is **healthy**, meaning connected to
Discord. See [Health check](#health-check).

### Option B: Node.js

Requires [Node.js](https://nodejs.org/) 22.12 or newer (an LTS release is recommended).

```sh
npm ci
npm run build
npm run deploy-commands   # register slash commands (see step 4)
npm start
```

The bot only works while this process runs. To keep it running in the
background, use a process manager such as [pm2](https://pm2.keymetrics.io/)
(`pm2 start dist/index.js --name url-bot`) or a systemd service.

Logs are JSON lines on standard output. For readable output while testing,
pipe them through pino-pretty: `npm start | npx pino-pretty`.

Settings are stored in `./data/bot.db`.

## 4. Register the slash commands

Discord has to be told about the `/fixlinks` command once, and again whenever
an update changes the commands. When unsure, run it again after updating; it's
harmless.

- With `DEV_GUILD_ID` set, commands are registered **for that server only** and
  appear immediately. That's ideal for testing.
- With `DEV_GUILD_ID` empty, commands are registered **globally** (every server
  the bot is in). This can take up to about an hour to show up.

Use `npm run deploy-commands` (Node) or
`docker compose run --rm bot node dist/deploy-commands.js` (Docker).

## 5. Configure it

### Per-server settings: `/fixlinks`

Only members with **Manage Server** can use these. All replies are visible only
to you.

| Command | What it does |
| --- | --- |
| `/fixlinks list` | Show the active rules, mode and on/off status |
| `/fixlinks add from:<domain> to:<domain>` | Add a custom rule, or override a built-in one |
| `/fixlinks remove from:<domain>` | Remove a custom rule |
| `/fixlinks default disable from:<domain>` | Turn off a built-in rule in this server |
| `/fixlinks default enable from:<domain>` | Turn a built-in rule back on |
| `/fixlinks mode value:<mode>` | `reply` (just reply) or `reply_suppress` (reply and hide the original embed) |
| `/fixlinks toggle enabled:<true/false>` | Turn the bot on or off in this server |
| `/fixlinks reset` | Delete all of this server's custom settings |

Examples:

```
/fixlinks add from:bsky.app to:bskx.app
/fixlinks add from:x.com to:fixupx.com        ← overrides the built-in x.com rule
/fixlinks default disable from:reddit.com
```

Domains must be plain domains like `example.com`. URLs, paths, ports, IP
addresses and `localhost` are rejected. Replacement domains must be on the bot
owner's allowlist (see below), can't be internationalized (`xn--`) look-alike
domains, and can't be a domain another rule rewrites. Every change is logged
with the server ID, the user ID and the domains involved.

**Reply modes:** `reply_suppress` is the default. It hides the original embed
so only the fixed one shows. This needs the **Manage Messages** and **Read
Message History** permissions in that channel; without them, it just replies
instead. Discord can only hide *all* embeds on a message, so if a message also
contains, say, a YouTube link, that preview is hidden too. Use `reply` mode if
that bothers your server.

The bot needs **Embed Links** in a channel, otherwise the fixed link couldn't
show a preview, so it doesn't reply there.

**Deleting a reply:** the 🗑️ button under each reply removes it. Only the
person who posted the link or someone with Manage Messages can use it. If the
bot hid the original embed, it restores it. It never un-hides embeds that it
didn't hide itself.

**Limiting channels:** use Discord's own permissions. In a channel's settings →
**Permissions**, deny the bot **Send Messages** (or **View Channel**) wherever
you don't want it to respond.

### Global settings: `config/rules.json`

This file belongs to whoever hosts the bot, and it applies to every server.

```json
{
  "rules": [
    { "from": "x.com", "to": "vxtwitter.com" }
  ],
  "policy": {
    "maxCustomRulesPerGuild": 25,
    "allowedCustomTargets": null
  }
}
```

- `rules`: the built-in rules.
- `maxCustomRulesPerGuild`: how many custom rules each server may add (0–100).
- `allowedCustomTargets`: the replacement domains server admins may use with
  `/fixlinks add`. The targets of the built-in rules are always allowed. The
  shipped list contains well-known embed-fixing services. If the setting is
  missing, only the built-in targets are allowed. Setting it to `null` allows
  **any** domain. Only do that if you trust every admin of every server the bot
  is in, because a malicious admin could otherwise make your trusted bot post
  phishing links in place of real ones.

The bot checks this file at startup and refuses to start if anything is
invalid. Restart the bot after editing it (`docker compose restart` or restart
the Node process).

---

## Security

How the bot protects you and your server:

- **No pings, ever.** Every message the bot sends has mentions disabled, so a
  link containing `@everyone` or a role mention can't ping anyone.
- **The bot only posts rewritten links.** It never echoes any other part of the
  user's message.
- **Strict domain matching.** Rules match a domain and its subdomains only,
  never by substring. Rule domains are validated, so no URLs, paths, IPs or
  markdown are allowed.
- **Least privilege.** The bot needs no Administrator permission, and Manage
  Messages is optional. It also only requests the gateway intents it uses.
- **Admin-only configuration.** `/fixlinks` is restricted to Manage Server by
  default. The bot also re-checks this itself, because server admins can change
  Discord's command permissions.
- **No impersonation.** The bot never deletes users' messages or reposts as
  them through webhooks.
- **Loop and spam protection.** It ignores other bots and webhooks. Replies are
  rate limited per user (one every 3 s), per channel (10 per 30 s), per server
  (30 per minute) and globally (50 per 10 s). Links over the limit are skipped
  silently. At most 5 links are fixed per message.
- **Safe defaults for custom rules.** Server admins can only point rules at
  known embed-fixing services unless the bot owner allows more, and rule
  changes are logged.
- **Minimal data.** Only server IDs and rule domains are stored, in a database
  file only the bot's user can read. Message content is never stored or logged.
  A server's data is deleted when the bot leaves it (or at the next startup, if
  it was removed while offline). Tracking parameters are stripped from links.
- **Safe queries.** All database access uses prepared statements.
- **Token hygiene.** The token is read from the environment, removed from
  `process.env` after startup, and redacted from logs. `.env` is git-ignored.
  Note that anyone who can run `docker inspect` on the host can still read it,
  so treat Docker access on that machine as access to the token.
- **Hardened container.** It runs as non-root on a read-only filesystem with
  all Linux capabilities dropped and `no-new-privileges` set.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Tips for first-time bot hosts

1. **The token is the bot.** Never commit it, paste it in chats or screenshot
   it. If it leaks, click **Reset Token** in the Developer Portal right away.
   (GitHub also scans public repos and Discord auto-resets tokens it finds.)
2. **If you publish your fork,** turn on **Secret scanning** and **Push
   protection** in the repo's Settings → Code security. That way GitHub blocks
   accidental token commits.
3. **Message Content is a privileged intent.** It's free for bots in fewer than
   100 servers. Beyond that, Discord requires verification.
4. **The replacement services are third parties.** vxtwitter, vxtiktok and the
   others see every link the bot rewrites, and they can go down or change
   owners. If one stops working or you stop trusting it, change the rule.
5. **Don't add other link-fixing bots** to the same server. You'll get duplicate
   replies.
6. **Keep it updated.** Dependabot opens PRs for dependency updates. Run
   `npm audit` occasionally if you're not using GitHub.

## Health check

The bot has no web server and opens no ports. Instead, while it's connected to
Discord it writes a timestamp to a heartbeat file every 15 seconds:

- `npm run healthcheck` (or `node dist/healthcheck.js`) prints `healthy` and
  exits with code 0 if the heartbeat is less than 60 seconds old. Otherwise it
  prints `unhealthy` and exits with code 1.
- The Docker image runs this check every 30 seconds, so `docker compose ps`
  shows `healthy` or `unhealthy`.
- If the bot can't connect, or stays disconnected for more than 5 minutes, it
  exits with code 1 so Docker, pm2 or systemd restart it. Short disconnects are
  normal, and discord.js reconnects on its own.

Docker on its own doesn't restart containers just for being *unhealthy*. That's
why the bot exits by itself when it's stuck. To get alerts, point your
monitoring at `docker inspect --format '{{.State.Health.Status}}' <container>`
or at the healthcheck command.

The heartbeat file is `/tmp/heartbeat` in Docker. When running with Node it's
in the system temp directory. Set `HEARTBEAT_PATH` to change it, and use the
same value for the bot and the healthcheck command.

## Updating

```sh
git pull
# Docker:
docker compose up -d --build
# Node:
npm ci && npm run build && npm start
```

Then run the [deploy-commands step](#4-register-the-slash-commands) again in
case the commands changed. The database upgrades itself automatically on startup.

## Backups

All per-server settings live in one SQLite file. To back it up, stop the bot
first so the file is consistent, then copy it:

```sh
# Docker
docker compose stop
docker run --rm -v social-url-replacer-bot_bot-data:/data -v "$PWD":/backup alpine \
  cp /data/bot.db /backup/bot-backup.db
docker compose start

# Node
cp data/bot.db bot-backup.db   # while the bot is stopped
```

The volume name is `<folder name>_bot-data`; `docker volume ls` shows it. To
restore, copy the file back the same way while the bot is stopped.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Bot is online but doesn't reply to links | Enable **Message Content Intent** in the Developer Portal (Bot tab), then restart the bot. Check that it has View Channel, Send Messages and **Embed Links** in that channel. |
| `/fixlinks` doesn't appear | Run the deploy-commands step. Global commands can take up to about an hour. You need Manage Server to see it. |
| Original embed isn't hidden | Give the bot **Manage Messages** and **Read Message History** in that channel, and check that the mode is `reply_suppress`. |
| `/fixlinks add` says the domain isn't allowed | The replacement isn't on `allowedCustomTargets` in `config/rules.json`. The bot owner can add it there. |
| `Invalid environment configuration` at startup | `.env` is missing or a value is wrong. Compare it with `.env.example`. |
| `Invalid rules config` at startup | Fix the reported entry in `config/rules.json`. |
| Container shows `unhealthy` | The bot isn't connected to Discord. Check `docker compose logs` for errors, such as an invalid token or network problems. It restarts by itself after 5 minutes disconnected. |
| `An invalid token was provided` | The token is wrong or was reset. Copy a fresh one into `.env`. |

## Development

```sh
npm ci
npm run dev          # run with auto-reload (uses .env)
npm test             # unit tests
npm run typecheck
npm run lint
```

Project layout:

```
src/
  index.ts              startup, Discord client, event wiring
  env.ts / config.ts    validated environment and rules file
  domain.ts             domain validation and matching
  extract.ts            finds links in a message
  rewrite.ts            applies rules to links
  tracking.ts           removes tracking parameters
  store.ts              SQLite storage for per-server settings
  rateLimit.ts          spam protection
  health.ts             heartbeat + exit-when-stuck watchdog
  healthcheck.ts        healthcheck command used by Docker
  commands/fixlinks.ts  /fixlinks slash command
  handlers/             message and interaction handlers
test/                   unit tests (vitest)
```

## License

[MIT](LICENSE)
