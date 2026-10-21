import { BadRequestError, UnauthorizedError } from '@rexezuge/errors';
import {
  DISCORD_SIGNATURE_HEADER,
  DISCORD_TIMESTAMP_HEADER,
  INTERACTION_TYPE,
  interactionAuthor,
  interactionChannelId,
  interactionText,
  isPing,
  parseInteraction,
  routeKey,
  verifyDiscordSignature,
} from '@discord-telegram-bridge/bridge-core';
import type { DiscordMessageModel } from '@discord-telegram-bridge/bridge-core';
import { Tokens } from '../composition';
import type { BridgeContext } from '../types';

/**
 * The Discord Interactions Endpoint.
 *
 * Discord signs every interaction request with the application's private key
 * and sends the signature in a header. The signed message is the timestamp
 * concatenated with the *raw* body, so the body is read as text and never
 * re-serialised: a parsed-then-re-encoded body does not reproduce the bytes
 * Discord signed, and every request would fail verification.
 *
 * The endpoint answers three kinds of request: the PING Discord sends when an
 * Interactions Endpoint URL is first configured, a command a user ran, and
 * everything else — which is refused rather than forwarded, because a bridge
 * that relays an interaction it does not understand relays noise.
 */

/**
 * The interaction response type that shows a message in the channel.
 */
const RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE = 4;

/**
 * Handle `POST /discord/interactions`.
 */
export async function interactionsPost(c: BridgeContext): Promise<Response> {
  const scope = c.get('scope');
  const env = scope.get(Tokens.Env);

  const raw = await c.req.raw.text();
  const signature = c.req.header(DISCORD_SIGNATURE_HEADER);
  const timestamp = c.req.header(DISCORD_TIMESTAMP_HEADER);
  if (signature === undefined || timestamp === undefined) {
    throw new UnauthorizedError('The request carries no Discord signature.');
  }

  const verified = await verifyDiscordSignature({
    signature,
    timestamp,
    body: raw,
    publicKey: env.DISCORD_PUBLIC_KEY,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verified) {
    throw new UnauthorizedError('The request signature is not valid.');
  }

  const interaction = parseInteraction(parseJson(raw));
  if (isPing(interaction)) {
    return c.json({ type: INTERACTION_TYPE.PING });
  }

  const author = interactionAuthor(interaction);
  const content = interactionText(interaction);
  const model: DiscordMessageModel = {
    ...(author !== undefined && { author }),
    ...(content.length > 0 && { content }),
  };

  const channelId = interactionChannelId(interaction);
  const candidates = channelId === undefined ? [] : [routeKey('channel', channelId), routeKey('webhook', channelId)];

  const bridge = scope.get(Tokens.BridgeService);
  try {
    await bridge.forward(model, candidates);
  } catch (error: unknown) {
    // Discord expects an answer within three seconds and treats a non-200 as a
    // failed delivery, so the failure is reported in the channel rather than as
    // an HTTP error. The cause is logged for the operator.
    console.error('The interaction could not be forwarded to Telegram:', error);
    return c.json({
      type: RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'The bridge could not deliver this message to Telegram.' },
    });
  }

  return c.json({
    type: RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Forwarded to Telegram.' },
  });
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
