# AGENTS.md

Guidance for agents working in the test suite.

## Where the suites live

`test/` is a workspace project of its own — it has a `tsconfig.json` and is
not covered by any package's `tsc`, so `pnpm run typecheck:test` checks it
separately.

| Directory           | Covers                                                 |
| ------------------- | ------------------------------------------------------ |
| `test/bridge-core/` | the pure conversion rules                              |
| `test/bridge/`      | the application: routes, clients, services, the worker |
| `test/mocks/`       | the `cloudflare:workers` stand-in                      |

## The rules

**Test the wiring, not a mock of it.** The application suites drive the real
application — the real middleware, the real composition root, the real
services — with the Telegram API stubbed at the `fetch` boundary. What is
under test is the wiring, and a mock of the wiring proves nothing about it.

**Sign for real.** The signature suites generate an Ed25519 key pair with the
platform's own Web Crypto and sign the request the way Discord signs it. A
fixture that merely looks like a signed request proves nothing about the
verification.

**Assert the envelope.** The error assertions check the status and the
`{"Exception":{"Type","Message"}}` body, because the body is the contract a
client parses.

## Mocks

`test/mocks/cloudflare-workers.ts` is the `cloudflare:workers` stand-in. The
kit's `@rexezuge/runtime` barrel re-exports its Durable Object and Workflow
bases, so importing the runtime — even only for `AbstractEntrypointWorker` —
evaluates modules that extend these platform classes and must import them from
a module that exists. Nothing in the mock is exercised.

`test/bridge/support.ts` holds the fixtures: the fake KV namespace, the
environment builder, and the `fetch` stub that records what the Telegram API
was asked.

## Thresholds

`vitest.config.mts` carries the coverage floors, and they are the **measured**
values rather than a number picked in advance. The response to a drop is a
test, not a lowered number.
