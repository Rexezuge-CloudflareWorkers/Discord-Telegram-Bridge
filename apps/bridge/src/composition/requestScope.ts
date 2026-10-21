import { Container } from '@rexezuge/runtime';
import { readOptionalBinding } from '../bindings';
import { DiscordAttachmentClient } from '../clients/DiscordAttachmentClient';
import { RouteStore } from '../clients/RouteStore';
import { TelegramClient } from '../clients/TelegramClient';
import { BridgeService } from '../services/BridgeService';
import { Tokens } from './tokens';

/**
 * The per-request composition root.
 *
 * One scope per request, built from the request's bindings, so the services
 * a route resolves are the ones this request's configuration asks for. No
 * service is constructed at a call site: a route asks the scope for what it
 * needs, and the scope is the only place that knows how the pieces fit.
 */

/**
 * The bindings the scope's services require.
 */
export interface RequestScopeEnv {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_WEBHOOK_TOKEN: string;
  BRIDGE_ROUTES: KVNamespace;
}

/**
 * Compile-time proof that the scope declares every binding it needs.
 *
 * The check is on key coverage rather than assignability: the scope is built
 * from the platform's `Env`, and the assertion is what stops a binding being
 * renamed in one place and not the other.
 */
type AssertCoversKeys<TSource, TTarget> =
  Exclude<keyof TTarget, keyof TSource> extends never
    ? true
    : ['The request scope is missing bindings required by RequestScopeEnv', Exclude<keyof TTarget, keyof TSource>];

/**
 * The coverage assertion, bound to a value so the compiler resolves it.
 *
 * A type alias is only evaluated when it is used, so declaring the assertion
 * on its own checks nothing — it would pass for every binding. Binding the
 * tuple to a value makes the compiler resolve each element.
 */
type ScopeEnvCoverage = [AssertCoversKeys<Env, RequestScopeEnv>];

export const SCOPE_ENV_COVERAGE: ScopeEnvCoverage = [true];

/**
 * Build the scope for one request.
 */
export function createRequestScope(env: Env): Container {
  const scope = new Container();

  const routeStore = new RouteStore(env.BRIDGE_ROUTES);
  const telegramClient = new TelegramClient({ botToken: env.TELEGRAM_BOT_TOKEN });
  const attachmentClient = new DiscordAttachmentClient();

  scope.bindValue(Tokens.Env, env);
  scope.bindValue(Tokens.RouteStore, routeStore);
  scope.bindValue(Tokens.TelegramClient, telegramClient);
  scope.bindValue(Tokens.AttachmentClient, attachmentClient);
  scope.bindValue(
    Tokens.BridgeService,
    new BridgeService({
      telegram: telegramClient,
      routes: routeStore,
      attachments: attachmentClient,
      defaultChatId: readOptionalBinding(env, 'TELEGRAM_CHAT_ID') ?? null,
    }),
  );

  return scope;
}
