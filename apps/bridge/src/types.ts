import type { Container } from '@rexezuge/runtime';
import type { Context } from 'hono';

/**
 * The Hono environment the bridge runs in.
 *
 * `Bindings` is the platform's `Env` — the generated bindings plus the
 * secrets this repo declares. `Variables` carries the per-request scope, so a
 * route resolves its services from the scope rather than constructing them.
 */
export interface BridgeEnv {
  Bindings: Env;
  Variables: {
    scope: Container;
  };
}

/**
 * The context every route handler receives.
 */
export type BridgeContext = Context<BridgeEnv>;
