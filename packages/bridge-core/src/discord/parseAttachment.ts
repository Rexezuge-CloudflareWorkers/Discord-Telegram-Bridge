import { compact, isPlainObject, readString } from '../util/read';
import type { DiscordAttachment } from './types';

/**
 * Reading one attachment's metadata.
 *
 * Shared by the two inbound surfaces: a webhook payload and a resolved
 * interaction message both carry attachments, and both describe them the same
 * way. The bytes are never here — an attachment is either uploaded alongside
 * the request or fetched from the CDN, and that is the application's business.
 */
export function parseAttachment(raw: unknown): DiscordAttachment | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const size = raw['size'];
  return compact({
    id: readString(raw, 'id'),
    filename: readString(raw, 'filename'),
    content_type: readString(raw, 'content_type'),
    url: readString(raw, 'url'),
    proxy_url: readString(raw, 'proxy_url'),
    size: typeof size === 'number' && Number.isFinite(size) ? size : undefined,
  });
}
