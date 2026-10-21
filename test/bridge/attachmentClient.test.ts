import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DiscordAttachmentClient,
  isPhoto,
  MAX_ATTACHMENT_BYTES,
  MAX_PHOTO_BYTES,
} from '@discord-telegram-bridge/bridge/clients/DiscordAttachmentClient';
import type { DiscordAttachment } from '@discord-telegram-bridge/bridge-core';

/**
 * Fetching Discord attachments.
 */
describe('DiscordAttachmentClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads an attachment', async () => {
    vi.stubGlobal(
      'fetch',
      async (): Promise<Response> => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } }),
    );

    const client = new DiscordAttachmentClient();
    const file = await client.download({ url: 'https://cdn.discordapp.com/a.png', filename: 'a.png', content_type: 'image/png' });

    expect(file?.filename).toBe('a.png');
    expect(file?.contentType).toBe('image/png');
    expect(file?.bytes.byteLength).toBe(3);
  });

  it('answers null for an attachment with no URL', async () => {
    const client = new DiscordAttachmentClient();
    expect(await client.download({ filename: 'a.png' })).toBeNull();
  });

  it('answers null when the fetch fails', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => {
      throw new Error('network down');
    });

    const client = new DiscordAttachmentClient();
    expect(await client.download({ url: 'https://cdn.discordapp.com/a.png' })).toBeNull();
  });

  it('answers null when Discord answers with an error', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => new Response('gone', { status: 404 }));

    const client = new DiscordAttachmentClient();
    expect(await client.download({ url: 'https://cdn.discordapp.com/a.png' })).toBeNull();
  });

  it('refuses an attachment Discord says is too large without fetching it', async () => {
    let fetched = false;
    vi.stubGlobal('fetch', async (): Promise<Response> => {
      fetched = true;
      return new Response('x', { status: 200 });
    });

    const client = new DiscordAttachmentClient();
    const attachment: DiscordAttachment = { url: 'https://cdn.discordapp.com/a.png', size: MAX_ATTACHMENT_BYTES + 1 };
    expect(await client.download(attachment)).toBeNull();
    expect(fetched).toBe(false);
  });

  it('falls back to a proxy URL', async () => {
    let requested = '';
    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      requested = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      return new Response(new Uint8Array([1]), { status: 200 });
    });

    const client = new DiscordAttachmentClient();
    await client.download({ proxy_url: 'https://media.discordapp.net/a.png' });
    expect(requested).toBe('https://media.discordapp.net/a.png');
  });
});

describe('isPhoto', () => {
  it('accepts an image inside the size limit', () => {
    expect(isPhoto({ filename: 'a.png', contentType: 'image/png', bytes: new Uint8Array(10) })).toBe(true);
  });

  it('refuses an image above the size limit', () => {
    expect(isPhoto({ filename: 'a.png', contentType: 'image/png', bytes: new Uint8Array(MAX_PHOTO_BYTES + 1) })).toBe(false);
  });

  it('refuses a file that is not an image', () => {
    expect(isPhoto({ filename: 'a.txt', contentType: 'text/plain', bytes: new Uint8Array(10) })).toBe(false);
  });
});
