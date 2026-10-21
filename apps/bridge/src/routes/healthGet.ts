import type { BridgeContext } from '../types';

/**
 * The liveness probe.
 *
 * It answers without touching Telegram, Discord or KV: the question it
 * answers is "is this Worker serving requests", and a probe that reaches out
 * to three services reports on those services instead.
 */
export function healthGet(c: BridgeContext): Response {
  return c.json({ status: 'ok' });
}
