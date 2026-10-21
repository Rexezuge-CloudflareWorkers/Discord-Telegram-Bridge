import { BadRequestError } from '@rexezuge/errors';
import { compact, isPlainObject, readArray, readBoolean, readString } from '../util/read';
import { parseAttachment } from './parseAttachment';
import type {
  DiscordAttachment,
  DiscordEmbed,
  DiscordEmbedAuthor,
  DiscordEmbedField,
  DiscordEmbedFooter,
  DiscordWebhookPayload,
} from './types';

/**
 * Reading Discord's Execute Webhook body.
 *
 * The body is untrusted in every sense: it arrives from the internet, and its
 * shape is Discord's, not ours. The parser therefore answers with the
 * repository's own vocabulary — `null` normalised to absent, absent fields
 * omitted rather than set to `undefined` — and rejects a body that is not an
 * object at all.
 */

/**
 * Parse a Discord Execute Webhook body.
 *
 * @throws BadRequestError when the body is not a JSON object.
 */
export function parseWebhookPayload(raw: unknown): DiscordWebhookPayload {
  if (!isPlainObject(raw)) {
    throw new BadRequestError('The Discord webhook body must be a JSON object.');
  }
  return {
    ...compact({
      content: readString(raw, 'content'),
      username: readString(raw, 'username'),
      avatar_url: readString(raw, 'avatar_url'),
      tts: readBoolean(raw, 'tts'),
    }),
    ...compact({
      embeds: readArray(raw, 'embeds')
        ?.map((embed) => parseEmbed(embed))
        .filter((embed): embed is DiscordEmbed => embed !== null),
      attachments: readArray(raw, 'attachments')
        ?.map((attachment) => parseAttachment(attachment))
        .filter((a): a is DiscordAttachment => a !== null),
    }),
  };
}

/**
 * Parse one embed, or `null` when it is not an object.
 */
function parseEmbed(raw: unknown): DiscordEmbed | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  return {
    ...compact({
      title: readString(raw, 'title'),
      description: readString(raw, 'description'),
      url: readString(raw, 'url'),
      timestamp: readString(raw, 'timestamp'),
    }),
    ...compact({
      color: typeof raw['color'] === 'number' && Number.isFinite(raw['color']) ? raw['color'] : undefined,
      author: parseEmbedAuthor(raw['author']),
      footer: parseEmbedFooter(raw['footer']),
      fields: readArray(raw, 'fields')
        ?.map((field) => parseEmbedField(field))
        .filter((f): f is DiscordEmbedField => f !== null),
    }),
  };
}

/**
 * Parse an embed's author, or `undefined` when it is absent.
 */
function parseEmbedAuthor(raw: unknown): DiscordEmbedAuthor | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  return compact({
    name: readString(raw, 'name'),
    url: readString(raw, 'url'),
  });
}

/**
 * Parse an embed's footer, or `undefined` when it is absent.
 */
function parseEmbedFooter(raw: unknown): DiscordEmbedFooter | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  return compact({
    text: readString(raw, 'text'),
    icon_url: readString(raw, 'icon_url'),
  });
}

/**
 * Parse one embed field, or `null` when it is not an object.
 */
function parseEmbedField(raw: unknown): DiscordEmbedField | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  return compact({
    name: readString(raw, 'name'),
    value: readString(raw, 'value'),
    inline: readBoolean(raw, 'inline'),
  });
}
