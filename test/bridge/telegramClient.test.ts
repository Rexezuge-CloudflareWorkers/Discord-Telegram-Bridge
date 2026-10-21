import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, RateLimitedError, UnauthorizedError } from '@rexezuge/errors';
import { TelegramClient } from '@discord-telegram-bridge/bridge/clients/TelegramClient';

/**
 * The Telegram Bot API client.
 */
describe('TelegramClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a text message as HTML', async () => {
    const requests: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: readUrl(input), body: readBody(init) });
      return Response.json({ ok: true, result: {} }, { status: 200 });
    });

    const client = new TelegramClient({ botToken: 'token' });
    await client.sendText('-1001', { text: '<b>hi</b>', disableLinkPreview: true });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.telegram.org/bottoken/sendMessage');
    expect(JSON.parse(requests[0]?.body ?? '')).toEqual({
      chat_id: '-1001',
      text: '<b>hi</b>',
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  it('names the forum topic when there is one', async () => {
    const requests: { body: string }[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ body: readBody(init) });
      return Response.json({ ok: true, result: {} }, { status: 200 });
    });

    const client = new TelegramClient({ botToken: 'token' });
    await client.sendText('-1001', { text: 'hi', disableLinkPreview: true }, 42);

    expect(JSON.parse(requests[0]?.body ?? '')).toMatchObject({ message_thread_id: 42 });
  });

  it('reports a bad request as a bad request', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => Response.json({ ok: false, description: 'chat not found' }, { status: 400 }));

    const client = new TelegramClient({ botToken: 'token' });
    await expect(client.sendText('-1001', { text: 'hi', disableLinkPreview: true })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('reports a throttling as a rate limit', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => Response.json({ ok: false, description: 'too many' }, { status: 429 }));

    const client = new TelegramClient({ botToken: 'token' });
    await expect(client.sendText('-1001', { text: 'hi', disableLinkPreview: true })).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('reports a rejected token as unauthorized', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => Response.json({ ok: false, description: 'unauthorized' }, { status: 401 }));

    const client = new TelegramClient({ botToken: 'token' });
    await expect(client.sendText('-1001', { text: 'hi', disableLinkPreview: true })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('reports a gateway failure without the upstream message', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => Response.json({ ok: false, description: 'internal' }, { status: 500 }));

    const client = new TelegramClient({ botToken: 'token' });
    await expect(client.sendText('-1001', { text: 'hi', disableLinkPreview: true })).rejects.toMatchObject({
      status: 502,
    });
  });

  it('uploads a file as multipart', async () => {
    const requests: { body: BodyInit | null | undefined }[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ body: init?.body });
      return Response.json({ ok: true, result: {} }, { status: 200 });
    });

    const client = new TelegramClient({ botToken: 'token' });
    await client.sendDocument('-1001', { filename: 'a.txt', contentType: 'text/plain', bytes: new Uint8Array([1, 2, 3]) }, 'a.txt');

    const body = requests[0]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('chat_id')).toBe('-1001');
  });
});

/**
 * Read the URL a `fetch` was called with.
 */
function readUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return input instanceof URL ? input.href : input;
}

/**
 * Read the body a `fetch` was called with, as text.
 */
function readBody(init?: RequestInit): string {
  return typeof init?.body === 'string' ? init.body : '';
}
