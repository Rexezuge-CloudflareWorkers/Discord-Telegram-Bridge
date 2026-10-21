# AGENTS.md

Guidance for agents working in Discord-Telegram-Bridge.

## Overview

Discord-Telegram-Bridge is a Cloudflare Worker that mirrors Discord messages
into Telegram. It is a pnpm workspace (`@discord-telegram-bridge/monorepo`,
`packageManager: pnpm@11.2.2`) built on the `@rexezuge/*` kernel (SDK v1.9.2).

- **Core**: `apps/bridge` serves four surfaces — a liveness probe, a
  Discord-compatible webhook receiver, a Discord Interactions Endpoint, and an
  Access-gated admin API for the route table. `packages/bridge-core` holds the
  pure conversion rules: markdown → Telegram HTML, message splitting, payload
  parsing, Ed25519 signature verification.
- **Direction**: Discord → Telegram. There is no reverse path.
- **Routing**: a Discord channel or webhook id maps to a Telegram chat, held in
  KV so a destination can be changed without a deploy. `TELEGRAM_CHAT_ID` is
  the fallback for anything unmapped.

## Kernel

| Package             | Provides                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `@rexezuge/runtime` | `AbstractEntrypointWorker` base, the DI `Container` and `Token`, `EnvParser`                  |
| `@rexezuge/errors`  | the error taxonomy; `ServiceError.from` at the boundary, `toErrorResponse()` for the envelope |
| `@rexezuge/shared`  | `timingSafeEqualStrings` (the webhook token), `ErrorSanitizationUtil` (redacted logging)      |
| `@rexezuge/http`    | `rateLimit`, `securityHeaders`, `authenticateAccess` (Cloudflare Access)                      |
| `@rexezuge/tooling` | the ESLint and Vitest factories, the god-file budget, the wrangler-config helpers             |

The kit is consumed at one pinned version, with `overrides` in
`pnpm-workspace.yaml` forcing **one copy of every package**. That override is
not tidiness: the kit versions in lockstep but a publish does not reach the
registry atomically, and two copies of a package that identifies its types with
`instanceof` is a silent correctness bug rather than a version warning.

Bumping the kit is one line in `pnpm-workspace.yaml`'s `overrides` plus the
manifests.

## Cloudflare Documentation

**STOP.** APIs, limits, and behavior change frequently. Before any Workers, KV,
or Queues task, retrieve current official docs.

- Workers: https://developers.cloudflare.com/workers/
- Cloudflare MCP: https://docs.mcp.cloudflare.com/mcp
- KV limits: https://developers.cloudflare.com/kv/platform/limits/
- Access: https://developers.cloudflare.com/cloudflare-one/policies/access/
- Worker errors: https://developers.cloudflare.com/workers/observability/errors/

The Discord and Telegram APIs have their own documentation, and both change:

- Discord webhooks: https://docs.discord.com/developers/resources/webhook
- Discord interactions: https://docs.discord.com/developers/interactions/overview
- Telegram Bot API: https://core.telegram.org/bots/api

## Commands

Plain `pnpm` is canonical (CI uses the `.github/actions/setup-env` composite:
`pnpm/action-setup@v4` + `actions/setup-node@v4` Node 24 + `pnpm install`).

```bash
pnpm install
pnpm run checks   # typecheck + lint + format:check + check:god-files + test:coverage
pnpm run typecheck
pnpm run lint     # eslint --fix --quiet, one process per workspace package
pnpm run lint:fix
pnpm run format   # prettier --write .
pnpm run format:check
pnpm run test
pnpm run test:coverage
pnpm run check:god-files
pnpm run typegen  # after changing wrangler bindings
pnpm run prepare-config  # template → wrangler.jsonc + provision BRIDGE_ROUTES
pnpm run dev      # wrangler dev
pnpm run deploy   # wrangler deploy
```

Notes:

- `pnpm run lint` runs `scripts/lint-workspaces.mjs`, which invokes ESLint once
  per workspace package plus `test/`. A single `eslint .` builds every tsconfig
  program at once and OOMs on a small machine (~1 GB).
- `wrangler.template.jsonc` is the config template — `pnpm run prepare-config`
  copies it to `wrangler.jsonc` per deployer. No committed `wrangler.jsonc`.
- The god-file guard (`@rexezuge/tooling`'s `check-god-files.ts`) is soft 300 /
  hard 400 LOC and is warn-only in CI.
- `pnpm install` runs `pnpm run typegen` as its postinstall, so
  `worker-configuration.d.ts` — which carries the platform's runtime types and
  the `KVNamespace` binding — is regenerated on every install. It is not
  committed.

## Import Direction

```
Layer 0: packages/bridge-core  — @rexezuge/{shared,errors} only, zero @discord-telegram-bridge/*
Layer 5: apps/bridge           → bridge-core + @rexezuge/{runtime,errors,http,shared} + hono
```

Enforced by the `@rexezuge/tooling` boundary table plus this repo's
`extraLayers` in `eslint.config.mjs`:

- `packages/bridge-core` must not import from other `@discord-telegram-bridge`
  packages — it is a zero-dependency base layer.
- `apps/bridge` must not self-import via its package name; it imports its own
  source relatively.

`packages/bridge-core` is **pure**: no `fetch`, no `cloudflare:` import, no
ambient binding. The Telegram client and the Discord attachment downloader live
in the app, where the I/O belongs.

`hono` is the only server framework, and it lives in `apps/bridge`. The kit's
rule — no server framework outside `@rexezuge/http` — is a rule about the kit's
own packages; a consumer declares `hono` itself, as Mail-Otter's `apps/api`
does.

## Null and undefined

The kit's rule, unchanged: `null` means **absent**, `undefined` means **not
supplied**. A service or domain layer answers `T | null` for "no answer"; an
optional argument is `arg?: T`; an optional property on a returned object is
omitted rather than set to `undefined`. Discord's payloads are null-heavy, so
the parsers normalise every `null` to _absent_ at the boundary rather than
carrying a third state inward.

## Index

| Area                                    | Guide                            |
| --------------------------------------- | -------------------------------- |
| Routes, authentication, response shapes | `apps/bridge/AGENTS.md`          |
| Bindings, wrangler, deploy              | `README.md`                      |
| Conversion rules, splitting, signatures | `packages/bridge-core/AGENTS.md` |
| Tests, thresholds, mock patterns        | `test/AGENTS.md`                 |

## Keeping AGENTS.md Current

Update the scoped sub-guide as part of any change that adds, removes, or
renames a route, a binding, or a conversion rule. Update this index only when
adding a new guide or a top-level feature.
