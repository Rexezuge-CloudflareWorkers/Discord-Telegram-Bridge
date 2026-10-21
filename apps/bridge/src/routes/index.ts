import { ServiceError } from '@rexezuge/errors';
import { Hono } from 'hono';
import { createRequestScope } from '../composition';
import { HttpHardening } from '../middleware';
import type { BridgeContext, BridgeEnv } from '../types';
import { adminRoutesDelete, adminRoutesList, adminRoutesPut } from './adminRoutes';
import { healthGet } from './healthGet';
import { interactionsPost } from './interactionsPost';
import { webhookPost } from './webhookPost';

/**
 * The HTTP surface.
 *
 * Four surfaces, each with its own authentication: a liveness probe that
 * needs none, a webhook receiver that needs the token in its path, an
 * interactions endpoint that needs a valid signature, and an admin API that
 * needs Cloudflare Access.
 */

/**
 * Build the application.
 *
 * The app is built once per Worker instance; the per-request work — the
 * composition root — happens in the middleware, where the request's bindings
 * are known.
 */
export function createBridgeApp(): Hono<BridgeEnv> {
  const app = new Hono<BridgeEnv>();

  app.use('*', async (c: BridgeContext, next) => {
    c.set('scope', createRequestScope(c.env));
    await next();
  });

  app.use('*', ...HttpHardening);

  app.get('/health', healthGet);
  app.post('/discord/webhooks/:id/:token', webhookPost);
  app.post('/discord/interactions', interactionsPost);
  app.get('/admin/routes', adminRoutesList);
  app.put('/admin/routes/:key', adminRoutesPut);
  app.delete('/admin/routes/:key', adminRoutesDelete);

  app.notFound((_c: BridgeContext) => jsonResponse({ Exception: { Type: 'NotFound', Message: 'No such route.' } }, 404));

  app.onError((error: unknown, _c: BridgeContext) => {
    const serviceError = ServiceError.from(error);
    if (serviceError.status >= 500) {
      // A 5xx message is for operators; the client gets the generic one.
      console.error('Unhandled error while serving a bridge request:', error);
    }
    const { status, body } = serviceError.toErrorResponse();
    return jsonResponse(body, status);
  });

  return app;
}

/**
 * Build a JSON response.
 *
 * `c.json` takes Hono's own status union, and the status here comes from the
 * error taxonomy — a `number` — so the response is built directly rather than
 * through a cast.
 */
function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export { adminRoutesDelete, adminRoutesPut, adminRoutesList } from './adminRoutes';
export { interactionsPost } from './interactionsPost';
export { healthGet } from './healthGet';
export { webhookPost } from './webhookPost';
