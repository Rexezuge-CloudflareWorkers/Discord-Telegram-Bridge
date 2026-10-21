import type { DiscordAttachment, TelegramOutboundFile } from '@discord-telegram-bridge/bridge-core';

/**
 * Fetching Discord attachments.
 *
 * An attachment reaches Telegram in one of two ways: it was uploaded with the
 * request and the bytes are already here, or it is referenced by URL and the
 * bytes have to be fetched. This client covers the second case; the first
 * never leaves the request.
 */

/**
 * The largest attachment the bridge will relay.
 *
 * Discord's own limit for a file attached to a message is 25 MB, so anything
 * larger did not come from Discord in the first place — and Telegram's
 * document upload limit is 50 MB, so the ceiling here is the tighter of the
 * two by a wide margin.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * The largest image Telegram accepts as a *photo*.
 *
 * Above this, Telegram rejects `sendPhoto`; the file is sent as a document
 * instead, which is the same bytes in a different wrapper.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Fetches attachments from Discord's CDN.
 */
export class DiscordAttachmentClient {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /**
   * Fetch one attachment.
   *
   * @returns The bytes, or `null` when the attachment cannot be fetched or is
   * too large to relay. A failed attachment is not a failed message: the
   * bridge relays the text and notes that the file did not come along.
   */
  async download(attachment: DiscordAttachment): Promise<TelegramOutboundFile | null> {
    const url = attachment.url ?? attachment.proxy_url;
    if (url === undefined || url.length === 0) {
      return null;
    }
    if (attachment.size !== undefined && attachment.size > MAX_ATTACHMENT_BYTES) {
      return null;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url);
    } catch {
      return null;
    }
    if (!response.ok) {
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return null;
    }

    return {
      filename: attachment.filename ?? 'attachment',
      contentType: attachment.content_type ?? 'application/octet-stream',
      bytes,
    };
  }
}

/**
 * Whether a file should be sent as a photo rather than a document.
 *
 * Telegram refuses a photo above 10 MB, and it refuses a file it cannot
 * recognise as an image, so both the type and the size decide.
 */
export function isPhoto(file: TelegramOutboundFile): boolean {
  return file.contentType.startsWith('image/') && file.bytes.byteLength <= MAX_PHOTO_BYTES;
}
