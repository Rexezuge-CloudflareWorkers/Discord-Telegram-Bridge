/**
 * `@discord-telegram-bridge/bridge-core` — the pure half of the bridge.
 *
 * Everything here is a function of its arguments: no `fetch`, no `cloudflare:`
 * import, no ambient binding. That is what makes the conversion rules
 * testable without a Worker, and it is what lets the layer boundary hold —
 * `bridge-core` is the zero-dependency base the application layer sits on.
 */

// Reading untrusted JSON into the repository's vocabulary.
export { compact, isPlainObject, readArray, readBoolean, readNumber, readObject, readString } from './util/read';

// Discord shapes.
export type {
  DiscordAttachment,
  DiscordEmbed,
  DiscordEmbedAuthor,
  DiscordEmbedField,
  DiscordEmbedFooter,
  DiscordInteraction,
  DiscordInteractionData,
  DiscordInteractionMessage,
  DiscordInteractionOption,
  DiscordMember,
  DiscordMessageModel,
  DiscordUser,
  DiscordWebhookPayload,
} from './discord/types';
export { parseAttachment } from './discord/parseAttachment';
export { parseWebhookPayload } from './discord/parseWebhookPayload';
export {
  INTERACTION_TYPE,
  interactionAttachments,
  interactionAuthor,
  interactionChannelId,
  interactionText,
  isPing,
  parseInteraction,
} from './discord/parseInteraction';
export { discordMarkdownToHtml } from './discord/markdown';
export {
  DISCORD_SIGNATURE_CLOCK_SKEW_SECONDS,
  DISCORD_SIGNATURE_HEADER,
  DISCORD_SIGNATURE_MAX_AGE_SECONDS,
  DISCORD_TIMESTAMP_HEADER,
  hexToBytes,
  verifyDiscordSignature,
} from './discord/signature';
export type { DiscordSignatureInput } from './discord/signature';

// Telegram shapes and rendering.
export type { TelegramDelivery, TelegramOutboundFile } from './telegram/types';
export { escapeHtml } from './telegram/escape';
export { BRIDGE_MAX_TEXT_LENGTH, TELEGRAM_MAX_TEXT_LENGTH, splitText, splitTextWithFirstBudget } from './telegram/split';
export { renderDeliveries } from './telegram/render';
export type { RenderOptions } from './telegram/render';

// Routing.
export type { BridgeRoute, ResolvedRoute, RouteKeyKind, RouteSource } from './routing/types';
export { parseRouteKey, routeKey } from './routing/types';
export { resolveRoute } from './routing/resolveRoute';
