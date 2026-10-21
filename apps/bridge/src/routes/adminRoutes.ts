import { BadRequestError, NotFoundError } from '@rexezuge/errors';
import { authenticateAccess } from '@rexezuge/http';
import { isPlainObject } from '@discord-telegram-bridge/bridge-core';
import type { BridgeRoute } from '@discord-telegram-bridge/bridge-core';
import { readOptionalBinding } from '../bindings';
import { isRouteKey } from '../clients/RouteStore';
import { Tokens } from '../composition';
import type { BridgeContext } from '../types';
import { requireParam } from './params';

/**
 * The route table's management API.
 *
 * Which Telegram chat a Discord channel reaches is a mapping an operator
 * changes, not a value a deploy carries, so it is editable at runtime. The
 * surface is behind Cloudflare Access: the alternative — a bearer secret of
 * our own — is one more credential to store, rotate and leak, and the family
 * already has the mechanism.
 *
 * When Access is not configured the routes answer 404 rather than opening up.
 * An endpoint that exists and cannot be authenticated is an endpoint that
 * looks configured and is not.
 */

/**
 * Handle `GET /admin/routes`.
 */
export async function adminRoutesList(c: BridgeContext): Promise<Response> {
  await requireAccess(c);
  const scope = c.get('scope');
  const store = scope.get(Tokens.RouteStore);
  const entries = await store.list();
  return c.json({ routes: entries });
}

/**
 * Handle `PUT /admin/routes/:key`.
 */
export async function adminRoutesPut(c: BridgeContext): Promise<Response> {
  await requireAccess(c);
  const key = readKey(c);
  const body = await readJson(c.req.raw);
  const route = readRoute(body);

  const scope = c.get('scope');
  const store = scope.get(Tokens.RouteStore);
  await store.put(key, route);
  return c.json({ key, route });
}

/**
 * Handle `DELETE /admin/routes/:key`.
 */
export async function adminRoutesDelete(c: BridgeContext): Promise<Response> {
  await requireAccess(c);
  const key = readKey(c);

  const scope = c.get('scope');
  const store = scope.get(Tokens.RouteStore);
  const deleted = await store.delete(key);
  return c.json({ key, deleted });
}

/**
 * The route key a request names.
 */
function readKey(c: BridgeContext): string {
  const key = decodeURIComponent(requireParam(c, 'key'));
  if (!isRouteKey(key)) {
    throw new BadRequestError('A route key is "channel:<id>" or "webhook:<id>".');
  }
  return key;
}

/**
 * Read a route from a request body.
 *
 * @throws BadRequestError when the body is not a route.
 */
function readRoute(body: unknown): BridgeRoute {
  if (!isPlainObject(body)) {
    throw new BadRequestError('The request body must be a route object.');
  }
  const chatId = body['chatId'];
  if (typeof chatId !== 'string' || chatId.trim().length === 0) {
    throw new BadRequestError('A route needs a "chatId".');
  }
  const threadId = body['threadId'];
  if (threadId !== undefined && (typeof threadId !== 'number' || !Number.isInteger(threadId))) {
    throw new BadRequestError('A route\'s "threadId" must be an integer.');
  }
  const enabled = body['enabled'];
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new BadRequestError('A route\'s "enabled" must be a boolean.');
  }
  const label = body['label'];
  if (label !== undefined && typeof label !== 'string') {
    throw new BadRequestError('A route\'s "label" must be a string.');
  }
  return {
    chatId: chatId.trim(),
    ...(typeof threadId === 'number' && { threadId }),
    ...(typeof label === 'string' && label.length > 0 && { label }),
    enabled: typeof enabled === 'boolean' ? enabled : true,
  };
}

/**
 * Authenticate the caller through Cloudflare Access.
 *
 * @throws NotFoundError when Access is not configured.
 */
async function requireAccess(c: BridgeContext): Promise<string> {
  const scope = c.get('scope');
  const env = scope.get(Tokens.Env);
  const teamDomain = readOptionalBinding(env, 'CF_ACCESS_TEAM_DOMAIN');
  const policyAud = readOptionalBinding(env, 'CF_ACCESS_AUD');
  if (teamDomain === undefined || policyAud === undefined) {
    throw new NotFoundError('The admin API is not configured.');
  }
  return authenticateAccess(c.req.raw, undefined, { teamDomain, policyAud });
}

/**
 * Read a JSON body.
 *
 * @throws BadRequestError when the body is not JSON.
 */
async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BadRequestError('The request body is not valid JSON.');
  }
}
