import type { Token } from '@rexezuge/runtime';
import type { DiscordAttachmentClient } from '../clients/DiscordAttachmentClient';
import type { RouteStore } from '../clients/RouteStore';
import type { TelegramClient } from '../clients/TelegramClient';
import type { BridgeService } from '../services/BridgeService';

/**
 * The composition root's token registry.
 *
 * Every service the request scope builds is resolved through a token, so a
 * route asks for what it needs instead of constructing it. The tokens carry
 * their value type, so `scope.get(Tokens.BridgeService)` infers the type
 * without an explicit generic at the call site.
 */
const Tokens = {
  Env: Symbol('Env') as Token<Env>,
  RouteStore: Symbol('RouteStore') as Token<RouteStore>,
  TelegramClient: Symbol('TelegramClient') as Token<TelegramClient>,
  AttachmentClient: Symbol('AttachmentClient') as Token<DiscordAttachmentClient>,
  BridgeService: Symbol('BridgeService') as Token<BridgeService>,
} satisfies Record<string, Token<unknown>>;

export { Tokens };
