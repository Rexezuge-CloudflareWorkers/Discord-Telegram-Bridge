/**
 * The mapping from a Discord source to a Telegram destination.
 *
 * A bridge with one destination is a configuration; a bridge with a mapping
 * table is a router. The table is keyed by the Discord id that identifies the
 * source — a channel for an interaction, a webhook for a webhook post — and
 * lives in KV so a mapping can be changed without a deploy.
 */

/**
 * Where a route came from.
 */
export type RouteSource = 'mapped' | 'default';

/**
 * One mapping.
 */
export interface BridgeRoute {
  /**
   * The Telegram chat that receives the messages.
   *
   * A chat id, or a `@channelusername` for a public channel.
   */
  readonly chatId: string;
  /**
   * The Telegram forum topic to post into, when the destination is a forum.
   */
  readonly threadId?: number;
  /**
   * Whether the mapping is in force. A disabled mapping is kept but skipped,
   * so turning a route off does not mean losing it.
   */
  readonly enabled: boolean;
  /**
   * A human-readable name for the mapping.
   */
  readonly label?: string;
}

/**
 * A route that has been resolved and is ready to use.
 */
export interface ResolvedRoute {
  readonly chatId: string;
  readonly threadId?: number;
  readonly source: RouteSource;
}

/**
 * The kinds of Discord id a route can be keyed by.
 */
export type RouteKeyKind = 'channel' | 'webhook';

/**
 * Build the key a route is stored under.
 *
 * The kind is part of the key because a channel id and a webhook id are
 * different namespaces: the same number means different things to Discord, and
 * a route configured for one must not answer for the other.
 */
export function routeKey(kind: RouteKeyKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Parse a route key back into its kind and id, or `null` when it is not one.
 */
export function parseRouteKey(value: string): { kind: RouteKeyKind; id: string } | null {
  const separator = value.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (id.length === 0) {
    return null;
  }
  if (kind !== 'channel' && kind !== 'webhook') {
    return null;
  }
  return { kind, id };
}
