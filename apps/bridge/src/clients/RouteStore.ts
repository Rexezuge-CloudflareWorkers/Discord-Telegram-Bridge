import { InternalServerError } from '@rexezuge/errors';
import { isPlainObject, parseRouteKey } from '@discord-telegram-bridge/bridge-core';
import type { BridgeRoute } from '@discord-telegram-bridge/bridge-core';

/**
 * The route table, in KV.
 *
 * A route says which Telegram chat a Discord source reaches. The table is
 * small — a handful of channels and webhooks — and it lives in KV so an
 * operator can change a destination without a deploy, which is the only reason
 * to make it configurable at all.
 */

/**
 * The prefix every route key carries in the namespace.
 *
 * The prefix keeps the routes in their own keyspace inside the namespace, so
 * the same namespace can hold other things later without a collision.
 */
export const ROUTE_KEY_PREFIX = 'route:';

/**
 * One stored route, with the key it is stored under.
 */
export interface RouteEntry {
  readonly key: string;
  readonly route: BridgeRoute;
}

/**
 * Reads and writes the route table.
 */
export class RouteStore {
  private readonly namespace: KVNamespace;

  constructor(namespace: KVNamespace) {
    this.namespace = namespace;
  }

  /**
   * Read one route.
   *
   * @returns The route, or `null` when the key is not mapped.
   * @throws InternalServerError when the stored value cannot be read as a
   * route. A corrupt route must not be mistaken for an absent one: the
   * difference is a message delivered to the wrong chat and a message
   * refused.
   */
  async get(key: string): Promise<BridgeRoute | null> {
    const raw = await this.namespace.get(storageKey(key));
    if (raw === null) {
      return null;
    }
    return parseRoute(raw, key);
  }

  /**
   * Read every route.
   */
  async loadAll(): Promise<Map<string, BridgeRoute>> {
    const routes = new Map<string, BridgeRoute>();
    for (const entry of await this.list()) {
      routes.set(entry.key, entry.route);
    }
    return routes;
  }

  /**
   * Read every route, with the key it is stored under.
   */
  async list(): Promise<RouteEntry[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.namespace.list({ prefix: ROUTE_KEY_PREFIX, cursor });
      for (const key of page.keys) {
        keys.push(key.name);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);

    if (keys.length === 0) {
      return [];
    }

    const values = await this.namespace.get(keys);
    const entries: RouteEntry[] = [];
    for (const key of keys) {
      const raw = values.get(key);
      if (raw === null || raw === undefined) {
        continue;
      }
      entries.push({ key: routeKeyFromStorageKey(key), route: parseRoute(raw, routeKeyFromStorageKey(key)) });
    }
    return entries;
  }

  /**
   * Write one route.
   */
  async put(key: string, route: BridgeRoute): Promise<void> {
    await this.namespace.put(storageKey(key), JSON.stringify(route));
  }

  /**
   * Delete one route.
   *
   * @returns Whether the route existed.
   */
  async delete(key: string): Promise<boolean> {
    const existing = await this.namespace.get(storageKey(key));
    await this.namespace.delete(storageKey(key));
    return existing !== null;
  }
}

/**
 * The KV key a route is stored under.
 */
function storageKey(key: string): string {
  return `${ROUTE_KEY_PREFIX}${key}`;
}

/**
 * The route key a stored KV key belongs to.
 */
function routeKeyFromStorageKey(storageKeyValue: string): string {
  return storageKeyValue.slice(ROUTE_KEY_PREFIX.length);
}

/**
 * Read a stored route.
 *
 * @throws InternalServerError when the stored value is not a route.
 */
function parseRoute(raw: string, key: string): BridgeRoute {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause: unknown) {
    throw new InternalServerError(`The route "${key}" is not readable JSON.`, { cause });
  }
  if (!isPlainObject(parsed)) {
    throw new InternalServerError(`The route "${key}" is not a route object.`);
  }
  const chatId = parsed['chatId'];
  if (typeof chatId !== 'string' || chatId.trim().length === 0) {
    throw new InternalServerError(`The route "${key}" has no chat id.`);
  }
  const threadId = parsed['threadId'];
  const label = parsed['label'];
  const enabled = parsed['enabled'];
  return {
    chatId: chatId.trim(),
    ...(typeof threadId === 'number' && Number.isInteger(threadId) && { threadId }),
    ...(typeof label === 'string' && label.length > 0 && { label }),
    enabled: typeof enabled === 'boolean' ? enabled : true,
  };
}

/**
 * Whether a key names a route this store can hold.
 */
export function isRouteKey(key: string): boolean {
  return parseRouteKey(key) !== null;
}
