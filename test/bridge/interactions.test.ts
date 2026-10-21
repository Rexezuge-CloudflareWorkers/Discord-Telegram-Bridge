import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeApp } from '@discord-telegram-bridge/bridge/routes';
import { createTestEnv, stubTelegramFetch } from './support';

/**
 * The interactions endpoint, driven with real signatures.
 *
 * The key pair is generated with the platform's Web Crypto, so the signature
 * the suite produces is the signature Discord would produce.
 */
describe('the interactions endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers a ping with a pong', async () => {
    stubTelegramFetch();
    const { publicKey, privateKey } = await generateKeyPair();
    const body = JSON.stringify({ type: 1 });
    const app = createBridgeApp();

    const response = await app.fetch(
      await signedRequest('https://bridge.test/discord/interactions', body, privateKey, publicKey),
      createTestEnv({ publicKey }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  it('forwards a command to Telegram', async () => {
    const calls = stubTelegramFetch();
    const { publicKey, privateKey } = await generateKeyPair();
    const body = JSON.stringify({
      type: 2,
      channel_id: '456',
      member: { user: { username: 'alex', global_name: 'Alex' } },
      data: { name: 'say', options: [{ name: 'text', value: 'hello there' }] },
    });
    const app = createBridgeApp();

    const response = await app.fetch(
      await signedRequest('https://bridge.test/discord/interactions', body, privateKey, publicKey),
      createTestEnv({ publicKey }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: 4, data: { content: 'Forwarded to Telegram.' } });
    expect(calls[0]?.body).toMatchObject({ text: '<b>Alex</b>\nhello there' });
  });

  it('reports a delivery failure in the channel rather than as an HTTP error', async () => {
    stubTelegramFetch(() => Response.json({ ok: false, description: 'nope' }, { status: 400 }));
    const { publicKey, privateKey } = await generateKeyPair();
    const body = JSON.stringify({ type: 2, channel_id: '456', data: { name: 'say', options: [{ value: 'hi' }] } });
    const app = createBridgeApp();

    const response = await app.fetch(
      await signedRequest('https://bridge.test/discord/interactions', body, privateKey, publicKey),
      createTestEnv({ publicKey }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: 4, data: { content: 'The bridge could not deliver this message to Telegram.' } });
  });

  it('refuses a signature made with another key', async () => {
    stubTelegramFetch();
    const { publicKey } = await generateKeyPair();
    const other = await generateKeyPair();
    const body = JSON.stringify({ type: 1 });
    const app = createBridgeApp();

    const response = await app.fetch(
      await signedRequest('https://bridge.test/discord/interactions', body, other.privateKey, other.publicKey),
      createTestEnv({ publicKey }),
    );

    expect(response.status).toBe(401);
  });

  it('refuses a signature that is too old', async () => {
    stubTelegramFetch();
    const { publicKey, privateKey } = await generateKeyPair();
    const body = JSON.stringify({ type: 1 });
    const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const app = createBridgeApp();

    const response = await app.fetch(
      await signedRequest('https://bridge.test/discord/interactions', body, privateKey, publicKey, timestamp),
      createTestEnv({ publicKey }),
    );

    expect(response.status).toBe(401);
  });
});

/**
 * Generate an Ed25519 key pair, with the public key hex-encoded.
 */
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const publicKey = Array.from(new Uint8Array(raw), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { publicKey, privateKey: pair.privateKey };
}

/**
 * Build a signed request the way Discord builds one.
 */
async function signedRequest(url: string, body: string, privateKey: CryptoKey, publicKey: string, timestamp?: string): Promise<Request> {
  const stamp = timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(stamp + body));
  const hex = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request(url, {
    method: 'POST',
    headers: { 'x-signature-ed25519': hex, 'x-signature-timestamp': stamp, 'Content-Type': 'application/json' },
    body,
  });
}
