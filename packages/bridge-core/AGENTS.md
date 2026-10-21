# AGENTS.md

Guidance for agents working in the bridge core.

## What belongs here

Pure functions only: no `fetch`, no `cloudflare:` import, no ambient binding,
no I/O of any kind. That is what makes the conversion rules testable without a
Worker, and it is what lets the layer boundary hold — `bridge-core` is the
zero-dependency base the application layer sits on.

The application layer owns the I/O: the Telegram client, the Discord
attachment downloader, the route table, and the wiring.

## The modules

| Module                           | Owns                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `discord/types.ts`               | the Discord shapes, normalised to absent-or-present         |
| `discord/parseWebhookPayload.ts` | the Execute Webhook body                                    |
| `discord/parseInteraction.ts`    | the Interactions body, and the PING / author / text helpers |
| `discord/parseAttachment.ts`     | one attachment's metadata                                   |
| `discord/markdown.ts`            | the block level: paragraphs, quotes, fenced code            |
| `discord/markdownInline.ts`      | the inline level: the constructs inside a block             |
| `discord/signature.ts`           | Ed25519 verification, and the hex decoder                   |
| `telegram/escape.ts`             | HTML escaping                                               |
| `telegram/split.ts`              | the 4096-character budget                                   |
| `telegram/render.ts`             | a Discord message → the Telegram messages that carry it     |
| `routing/*`                      | the route table's shape and the lookup                      |
| `util/read.ts`                   | reading untrusted JSON into the repository's vocabulary     |

## The two rules that shape the code

**`null` is absent.** Discord sends `"avatar_url": null` where a message with
no avatar would send nothing. The parsers normalise every `null` to _absent_ at
the boundary, so nothing downstream ever carries a third state. The
`compact()` helper drops the keys whose value is `undefined`, so an optional
property on a returned object is _omitted_ rather than set to `undefined` — the
two serialise differently.

**Escaping happens before formatting.** A Discord message is untrusted text
that happens to contain formatting characters. Every character that could be
read as a tag is escaped first, and the formatting tags are added afterwards;
otherwise the tags themselves would be escaped and the message would arrive
as literal `**bold**`.

## Splitting

Telegram caps `sendMessage` at 4096 characters **after entity parsing** — the
visible text, not the markup. So the split is computed on the plain text and
the markup is produced per chunk. `BRIDGE_MAX_TEXT_LENGTH` is 4000, below
Telegram's own cap, because the first message also carries the author line and
a message that is exactly at the cap is one character away from being
rejected.

## Signatures

`verifyDiscordSignature` never throws. A request that fails any check — a
malformed signature, a malformed key, a stale timestamp, a timestamp too far
in the future — is a request this bridge did not receive from Discord, and the
caller's answer to that is a 401, not an exception.

The freshness window is five minutes. Without one, a signature captured once
would be valid forever, which turns a signed-request scheme into a
bearer-token scheme.
