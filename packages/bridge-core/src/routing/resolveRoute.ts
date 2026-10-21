import type { BridgeRoute, ResolvedRoute } from './types';

/**
 * Finding the Telegram chat a Discord message belongs to.
 *
 * The lookup is a candidate list rather than a single key: a caller knows
 * which ids it has — a channel id, a webhook id — and offers them in the
 * order it prefers. The first mapping that is present and enabled wins; the
 * default chat is the last resort, and its absence is an error rather than a
 * silent drop.
 */

/**
 * Resolve the destination for a message.
 *
 * @param routes - The known mappings, keyed by `routeKey(kind, id)`.
 * @param candidates - The route keys to try, in order of preference.
 * @param defaultChatId - The chat to use when no mapping matches, or `null`
 * when there is none.
 * @returns The resolved route, or `null` when nothing matches.
 */
export function resolveRoute(
  routes: ReadonlyMap<string, BridgeRoute>,
  candidates: readonly string[],
  defaultChatId: string | null,
): ResolvedRoute | null {
  for (const candidate of candidates) {
    const route = routes.get(candidate);
    if (route === undefined || !route.enabled) {
      continue;
    }
    return {
      chatId: route.chatId,
      ...(route.threadId !== undefined && { threadId: route.threadId }),
      source: 'mapped',
    };
  }

  if (defaultChatId !== null && defaultChatId.trim().length > 0) {
    return { chatId: defaultChatId.trim(), source: 'default' };
  }

  return null;
}
