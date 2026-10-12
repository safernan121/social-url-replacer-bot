# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report it privately through GitHub: go to this repository's **Security** tab →
**Report a vulnerability**. Include what you found, how to reproduce it, and the
impact you expect. You'll get a reply as soon as possible.

## If your bot token leaked

If you run your own instance and your token was exposed (committed, pasted,
logged), reset it right away: Discord Developer Portal → your application →
**Bot** → **Reset Token**, then update your `.env` and restart the bot. The old
token stops working immediately.
