import { describe, expect, it } from 'vitest';
import { parseRouteKey, resolveRoute, routeKey } from '@discord-telegram-bridge/bridge-core';
import type { BridgeRoute } from '@discord-telegram-bridge/bridge-core';

/**
 * Finding the Telegram chat a Discord message belongs to.
 */
describe('routeKey', () => {
  it('namespaces the id by its kind', () => {
    expect(routeKey('channel', '123')).toBe('channel:123');
    expect(routeKey('webhook', '123')).toBe('webhook:123');
  });
});

describe('parseRouteKey', () => {
  it('reads a key back', () => {
    expect(parseRouteKey('channel:123')).toEqual({ kind: 'channel', id: '123' });
  });

  it('rejects a key with no kind', () => {
    expect(parseRouteKey('123')).toBeNull();
  });

  it('rejects an unknown kind', () => {
    expect(parseRouteKey('guild:123')).toBeNull();
  });

  it('rejects a key with no id', () => {
    expect(parseRouteKey('channel:')).toBeNull();
  });
});

describe('resolveRoute', () => {
  const route: BridgeRoute = { chatId: '-1001', enabled: true };

  it('prefers the first candidate that is mapped', () => {
    const routes = new Map([['channel:123', route]]);
    const resolved = resolveRoute(routes, ['channel:123', 'webhook:123'], null);
    expect(resolved?.chatId).toBe('-1001');
    expect(resolved?.source).toBe('mapped');
  });

  it('falls back to the default chat', () => {
    const resolved = resolveRoute(new Map(), ['channel:123'], '-1002');
    expect(resolved?.chatId).toBe('-1002');
    expect(resolved?.source).toBe('default');
  });

  it('skips a disabled route', () => {
    const routes = new Map([['channel:123', { ...route, enabled: false }]]);
    const resolved = resolveRoute(routes, ['channel:123'], '-1002');
    expect(resolved?.chatId).toBe('-1002');
    expect(resolved?.source).toBe('default');
  });

  it('carries a forum topic through', () => {
    const routes = new Map([['channel:123', { ...route, threadId: 7 }]]);
    expect(resolveRoute(routes, ['channel:123'], null)?.threadId).toBe(7);
  });

  it('resolves nothing when there is no mapping and no default', () => {
    expect(resolveRoute(new Map(), ['channel:123'], null)).toBeNull();
  });

  it('treats an empty default as no default', () => {
    expect(resolveRoute(new Map(), ['channel:123'], ' '.repeat(3))).toBeNull();
  });
});
