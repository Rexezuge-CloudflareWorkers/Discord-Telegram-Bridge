import { describe, expect, it } from 'vitest';
import { RouteStore } from '@discord-telegram-bridge/bridge/clients/RouteStore';
import { FakeKVNamespace } from './support';

/**
 * The route table in KV.
 */
describe('RouteStore', () => {
  it('answers null for a route that was never written', async () => {
    const store = new RouteStore(new FakeKVNamespace() as unknown as KVNamespace);
    expect(await store.get('channel:123')).toBeNull();
  });

  it('reads back a route it wrote', async () => {
    const store = new RouteStore(new FakeKVNamespace() as unknown as KVNamespace);
    await store.put('channel:123', { chatId: '-1001', enabled: true });
    expect(await store.get('channel:123')).toEqual({ chatId: '-1001', enabled: true });
  });

  it('keeps a route that was written under the same key twice', async () => {
    const store = new RouteStore(new FakeKVNamespace() as unknown as KVNamespace);
    await store.put('channel:123', { chatId: '-1001', enabled: true });
    await store.put('channel:123', { chatId: '-1002', enabled: false });
    expect(await store.get('channel:123')).toEqual({ chatId: '-1002', enabled: false });
  });

  it('lists every route', async () => {
    const namespace = new FakeKVNamespace();
    const store = new RouteStore(namespace as unknown as KVNamespace);
    await store.put('channel:1', { chatId: '-1001', enabled: true });
    await store.put('webhook:2', { chatId: '-1002', enabled: true });

    const entries = await store.list();
    expect(entries.map((entry) => entry.key).sort()).toEqual(['channel:1', 'webhook:2']);
  });

  it('deletes a route and says whether it was there', async () => {
    const store = new RouteStore(new FakeKVNamespace() as unknown as KVNamespace);
    await store.put('channel:123', { chatId: '-1001', enabled: true });
    expect(await store.delete('channel:123')).toBe(true);
    expect(await store.delete('channel:123')).toBe(false);
    expect(await store.get('channel:123')).toBeNull();
  });

  it('refuses to read a route that is not readable JSON', async () => {
    const namespace = new FakeKVNamespace();
    await namespace.put('route:channel:123', 'not json');
    const store = new RouteStore(namespace as unknown as KVNamespace);
    await expect(store.get('channel:123')).rejects.toThrow(/not readable JSON/);
  });

  it('refuses to read a route with no chat id', async () => {
    const namespace = new FakeKVNamespace();
    await namespace.put('route:channel:123', JSON.stringify({ enabled: true }));
    const store = new RouteStore(namespace as unknown as KVNamespace);
    await expect(store.get('channel:123')).rejects.toThrow(/no chat id/);
  });
});
