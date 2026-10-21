# Discord-Telegram-Bridge

A Cloudflare Worker that mirrors Discord messages into Telegram.

It is one-way: Discord → Telegram. There is no reverse path.

Two things can drive it:

- **A Discord-compatible webhook.** The Worker exposes
  `POST /discord/webhooks/{id}/{token}`, which accepts exactly the body
  Discord's own Execute Webhook accepts — `content`, `username`, `embeds`, and
  either JSON or the multipart form Discord uses for files. Anything that
  knows how to post to a Discord webhook can post here by swapping the host.
- **A Discord application.** The Worker is an Interactions Endpoint: Discord
  signs every request with the application's private key, the Worker verifies
  the signature, and a slash command's text is forwarded.

Messages are rendered from Discord markdown into Telegram HTML, split at
Telegram's 4096-character limit, and delivered to a Telegram chat. Which chat
depends on a route table, so one deployment can serve several Discord channels
to several Telegram chats.

## The family

This repo is part of the `Rexezuge-CloudflareWorkers` family and is built on
the `@rexezuge/*` kit, consumed at one pinned version. The kit provides the
error taxonomy, the worker base, the DI container, the HTTP middleware, and
the lint/test factories. See `AGENTS.md` for the conventions.

## Setup

### 1. A Telegram bot

1. Talk to [@BotFather](https://t.me/botfather) and `/newbot`.
2. Keep the token it gives you.
3. Add the bot to the Telegram chat or channel you want to receive into, and
   give it permission to post (an administrator, or "Can post messages").

The chat id is what the route points at. Forward a message to the bot and
open `https://api.telegram.org/bot<token>/getUpdates`, or read the id from
the channel's URL, depending on where the bot was added.

### 2. A Discord application (optional)

Only needed for the interactions endpoint. In the
[developer portal](https://discord.com/developers/applications):

1. Create an application, and copy its **public key** (General Information).
2. Register a **slash command** — the bridge reads the command's text from its
   options, so a `/say` command with a `text` option forwards that option.
3. Set the **Interactions Endpoint URL** to
   `https://<your-worker>/discord/interactions`. Discord will PING it; the
   Worker answers `{"type":1}`.

### 3. The Worker

```bash
pnpm install
pnpm run prepare-config     # materializes wrangler.jsonc and provisions the KV namespace
pnpm run typegen            # regenerates worker-configuration.d.ts
```

Set the secrets:

```bash
pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
pnpm exec wrangler secret put DISCORD_WEBHOOK_TOKEN
```

And the variables — either in `wrangler.jsonc` (locally) or through the
`WRANGLER_VARS_PATCH_JSON` repository variable (in CI):

| Variable                | Meaning                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`    | the BotFather token (secret)                                        |
| `TELEGRAM_CHAT_ID`      | the default Telegram chat for anything unmapped (secret)            |
| `DISCORD_PUBLIC_KEY`    | the application's public key, hex-encoded (var)                     |
| `DISCORD_WEBHOOK_TOKEN` | the shared token the webhook path must carry (secret)               |
| `BRIDGE_ROUTES`         | the KV namespace holding the route table (binding)                  |
| `CF_ACCESS_TEAM_DOMAIN` | the Access team domain, e.g. `https://example.cloudflareaccess.com` |
| `CF_ACCESS_AUD`         | the Access application audience tag                                 |
| `RATE_LIMIT_PER_MINUTE` | requests one address may make per minute (default `120`)            |

`TELEGRAM_CHAT_ID` may be empty: then a message from an unmapped source is
refused rather than delivered somewhere arbitrary.

The two Access variables are what the admin API needs. With either empty the
admin routes answer `404` — an endpoint that exists and cannot be
authenticated looks configured and is not.

### 4. The route table

The table maps a Discord source to a Telegram chat. It is edited through the
admin API, which is behind Cloudflare Access:

```bash
curl -X PUT https://<your-worker>/admin/routes/channel%3A1234567890 \
  -H 'Content-Type: application/json' \
  -H 'cf-access-jwt-assertion: <your-access-token>' \
  -d '{"chatId":"-1001234567890","label":"alerts"}'

curl https://<your-worker>/admin/routes \
  -H 'cf-access-jwt-assertion: <your-access-token>'
```

A key is `channel:<id>` or `webhook:<id>`:

- `channel:<id>` — the Discord channel an interaction came from.
- `webhook:<id>` — the webhook id in the inbound path.

The resolver tries the source's own kind first and the other kind second, and
falls back to `TELEGRAM_CHAT_ID`.

A route body is:

```json
{ "chatId": "-1001234567890", "threadId": 7, "enabled": true, "label": "alerts" }
```

`threadId` is a Telegram forum topic. `enabled: false` keeps the route but
skips it.

## Endpoints

| Method   | Path                           | Authentication              |
| -------- | ------------------------------ | --------------------------- |
| `GET`    | `/health`                      | none                        |
| `POST`   | `/discord/webhooks/:id/:token` | the token in the path       |
| `POST`   | `/discord/interactions`        | Discord's Ed25519 signature |
| `GET`    | `/admin/routes`                | Cloudflare Access           |
| `PUT`    | `/admin/routes/:key`           | Cloudflare Access           |
| `DELETE` | `/admin/routes/:key`           | Cloudflare Access           |

Errors use the family's envelope: `{"Exception":{"Type","Message"}}`.

## Development

```bash
pnpm install
pnpm run checks        # typecheck + lint + format:check + god-files + coverage
pnpm run test          # the unit suite
pnpm run test:coverage # the unit suite with the coverage floors
pnpm run dev           # wrangler dev
```

`pnpm run dev` and `pnpm run deploy` read the root `wrangler.jsonc`, which
`pnpm run prepare-config` materializes from the template. Run it first.

`pnpm install` runs `pnpm run typegen` as its postinstall, so
`worker-configuration.d.ts` — the platform's runtime types and the
`KVNamespace` binding — is regenerated on every install. It is not committed.

## Deploying

`pnpm run prepare-config` materializes `wrangler.jsonc` from
`apps/bridge/wrangler.template.jsonc` and provisions the KV namespace. The
deployment workflow runs it, then a dry run, then the deploy:

```bash
pnpm run prepare-config
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler deploy
```

## Licence

MIT. See `LICENSE`.
