# AGENTS.md

Guidance for agents working in the bridge worker.

## The four surfaces

| Method   | Path                           | Authentication              | Answers                |
| -------- | ------------------------------ | --------------------------- | ---------------------- |
| `GET`    | `/health`                      | none                        | `200 {"status":"ok"}`  |
| `POST`   | `/discord/webhooks/:id/:token` | the token in the path       | `204`                  |
| `POST`   | `/discord/interactions`        | Discord's Ed25519 signature | `200` with a response  |
| `GET`    | `/admin/routes`                | Cloudflare Access           | `200` with the routes  |
| `PUT`    | `/admin/routes/:key`           | Cloudflare Access           | `200` with the route   |
| `DELETE` | `/admin/routes/:key`           | Cloudflare Access           | `200` with the outcome |

Anything else answers `404` with the family envelope
`{"Exception":{"Type","Message"}}`.

## The webhook receiver

The path mirrors Discord's own Execute Webhook URL
(`/api/webhooks/{id}/{token}`), so a tool that knows how to post to a Discord
webhook can post here by swapping the host. The body is Discord's:

- **JSON** — `content`, `username`, `embeds`, `attachments`.
- **multipart** — `payload_json` plus `files[0]`, `files[1]`, … The files are
  matched to the `attachments` array by position, which is the order Discord
  itself uses.

The token is compared with `timingSafeEqualStrings`: a comparison that returns
early on the first difference is an oracle against a remote caller.

The `id` in the path is the **webhook** id. The route table is keyed by
`webhook:<id>` for these and by `channel:<id>` for interactions; the resolver
tries the webhook kind first here and the channel kind first there.

## The interactions endpoint

Discord signs every request with the application's private key. The signed
message is the timestamp concatenated with the **raw** body, so the body is
read as text before it is parsed — a parsed-then-re-encoded body does not
reproduce the bytes Discord signed, and every request would fail verification.

The signature is verified with `crypto.subtle.verify('Ed25519', …)` against
`DISCORD_PUBLIC_KEY`, and the timestamp must be within five minutes. A request
that fails either check answers `401`.

The PING Discord sends when the endpoint is configured answers `200 {"type":1}`.
A command answers `200 {"type":4,"data":{"content":…}}` — including when the
Telegram delivery fails, because Discord expects an answer within three
seconds and a non-200 is a failed delivery rather than a report. The cause is
logged; the channel is told.

## The admin API

Behind Cloudflare Access, using `@rexezuge/http`'s `authenticateAccess`. When
`CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` is unset the routes answer `404`:
an endpoint that exists and cannot be authenticated looks configured and is
not.

A route key is `channel:<id>` or `webhook:<id>`. A route body is
`{"chatId": string, "threadId"?: integer, "enabled"?: boolean, "label"?: string}`.

## Composition

One `Container` per request, built by `createRequestScope(env)` in the
middleware and carried on the Hono context. Routes resolve what they need with
`scope.get(Tokens.X)`; no service is constructed at a call site.

`SCOPE_ENV_COVERAGE` is the compile-time proof that the scope declares every
binding it needs. It is bound to a value so the compiler resolves it — a type
alias that is never used checks nothing.

## Errors

Every refusal is a `@rexezuge/errors` class, mapped once in `routes/index.ts`:
`ServiceError.from(error)` then `toErrorResponse()`. A 5xx message is for
operators; the client gets the generic one, and the cause is logged with
`console.error` under a static message.

The webhook receiver answers `204` on success and the family's error envelope
on failure. A caller that retries on a 5xx will retry; one that retries on a
4xx should not, because the request is the problem.

## The conversion rules

`packages/bridge-core` owns them; see `packages/bridge-core/AGENTS.md`. The
short version:

- Discord markdown is re-expressed as Telegram HTML. `**bold**` → `<b>`,
  `*italic*` → `<i>`, `~~strike~~` → `<s>`, `||spoiler||` → `<tg-spoiler>`,
  `` `code` `` → `<code>`, `> quote` → `<blockquote>`, `[label](url)` →
  `<a href>`. A link whose scheme is not `http`, `https` or `mailto` is
  rendered as plain text.
- User text is escaped before the tags are added, so a message can never
  inject markup.
- A message longer than one Telegram message is split at whitespace, on the
  **plain** text, and each chunk is rendered separately. A construct that
  straddles a split degrades to literal characters — a cosmetic cost, chosen
  over a message Telegram rejects.
- An embed is a card and does not split: it is truncated to fit, and the
  truncation is visible.
