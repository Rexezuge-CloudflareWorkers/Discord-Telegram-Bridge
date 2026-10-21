import { BadRequestError, UnauthorizedError } from '@rexezuge/errors';
import { timingSafeEqualStrings } from '@rexezuge/shared';
import { parseWebhookPayload, routeKey } from '@discord-telegram-bridge/bridge-core';
import type { DiscordMessageModel, DiscordWebhookPayload } from '@discord-telegram-bridge/bridge-core';
import { Tokens } from '../composition';
import type { BridgeContext } from '../types';
import { requireParam } from './params';

/**
 * The Discord-compatible webhook receiver.
 *
 * The route mirrors Discord's own Execute Webhook URL — `/api/webhooks/{id}/{token}`
 * — so a tool that knows how to post to a Discord webhook can post to this
 * bridge by swapping the host. The body is Discord's: `content`, `username`,
 * `embeds`, and either JSON or the multipart form Discord uses for files.
 *
 * The path token is the credential. It is compared in constant time, because
 * the caller is remote and a comparison that returns early is an oracle.
 */

/**
 * Handle `POST /discord/webhooks/:id/:token`.
 */
export async function webhookPost(c: BridgeContext): Promise<Response> {
  const scope = c.get('scope');
  const env = scope.get(Tokens.Env);

  const id = requireParam(c, 'id');
  const token = requireParam(c, 'token');
  if (!timingSafeEqualStrings(token, env.DISCORD_WEBHOOK_TOKEN)) {
    throw new UnauthorizedError('The webhook token is not valid.');
  }

  const { payload, files } = await readWebhookBody(c.req.raw);
  const model: DiscordMessageModel = {
    ...(payload.username !== undefined && { author: payload.username }),
    ...(payload.content !== undefined && { content: payload.content }),
    ...(payload.embeds !== undefined && { embeds: payload.embeds }),
    ...(payload.attachments !== undefined && { attachments: payload.attachments }),
  };

  const bridge = scope.get(Tokens.BridgeService);
  await bridge.forward(model, [routeKey('webhook', id), routeKey('channel', id)], files);

  // Discord answers a webhook with 204 and no body, and a caller that expects
  // that gets it.
  return new Response(null, { status: 204 });
}

/**
 * Read a webhook body, whether it arrived as JSON or as multipart.
 */
async function readWebhookBody(request: Request): Promise<{ payload: DiscordWebhookPayload; files: File[] }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const payloadJson = form.get('payload_json');
    const payload = parseWebhookPayload(typeof payloadJson === 'string' ? parseJson(payloadJson) : {});
    return { payload, files: collectFiles(form) };
  }
  return { payload: parseWebhookPayload(parseJson(await request.text())), files: [] };
}

/**
 * Collect the uploaded files, in the order Discord numbered them.
 *
 * Discord names the parts `files[0]`, `files[1]`, … and the `attachments`
 * array in the payload refers to them by that position, so the order is the
 * correspondence.
 */
function collectFiles(form: FormData): File[] {
  const entries: { index: number; file: File }[] = [];
  for (const [name, value] of form) {
    if (typeof value === 'string' || !name.startsWith('files')) {
      continue;
    }
    const parsed = Number(name.slice('files'.length).replaceAll(/[[\]]/g, ''));
    entries.push({ index: Number.isInteger(parsed) ? parsed : entries.length, file: value });
  }
  entries.sort((left, right) => left.index - right.index);
  return entries.map((entry) => entry.file);
}

/**
 * Read a JSON body.
 *
 * @throws BadRequestError when the body is not JSON.
 */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BadRequestError('The request body is not valid JSON.');
  }
}
