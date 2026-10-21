import { describe, expect, it } from 'vitest';
import { verifyDiscordSignature } from '@discord-telegram-bridge/bridge-core';

/**
 * Verifying Discord's request signatures.
 *
 * The key pair is generated with the platform's own Web Crypto, so the test
 * exercises the same code path the Worker does rather than a fixture that
 * merely looks like one.
 */

/**
 * A generated key pair, with the public key hex-encoded the way Discord
 * publishes it.
 */
async function generateKeyPair(): Promise<{ publicKeyHex: string; privateKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  return { publicKeyHex: toHex(new Uint8Array(raw)), privateKey: pair.privateKey };
}

/**
 * Sign a message the way Discord does.
 */
async function sign(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(timestamp + body));
  return toHex(new Uint8Array(signature));
}

/**
 * Hex-encode bytes.
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('verifyDiscordSignature', () => {
  it('accepts a signature Discord would have produced', async () => {
    const { publicKeyHex, privateKey } = await generateKeyPair();
    const timestamp = '1700000000';
    const body = '{"type":1}';
    const signature = await sign(privateKey, timestamp, body);

    const verified = await verifyDiscordSignature({
      signature,
      timestamp,
      body,
      publicKey: publicKeyHex,
      nowSeconds: 1_700_000_000,
    });

    expect(verified).toBe(true);
  });

  it('rejects a signature over a different body', async () => {
    const { publicKeyHex, privateKey } = await generateKeyPair();
    const timestamp = '1700000000';
    const signature = await sign(privateKey, timestamp, '{"type":1}');

    const verified = await verifyDiscordSignature({
      signature,
      timestamp,
      body: '{"type":2}',
      publicKey: publicKeyHex,
      nowSeconds: 1_700_000_000,
    });

    expect(verified).toBe(false);
  });

  it('rejects a signature over a different timestamp', async () => {
    const { publicKeyHex, privateKey } = await generateKeyPair();
    const signature = await sign(privateKey, '1700000000', '{"type":1}');

    const verified = await verifyDiscordSignature({
      signature,
      timestamp: '1700000001',
      body: '{"type":1}',
      publicKey: publicKeyHex,
      nowSeconds: 1_700_000_000,
    });

    expect(verified).toBe(false);
  });

  it('rejects a request that is too old', async () => {
    const { publicKeyHex, privateKey } = await generateKeyPair();
    const timestamp = '1700000000';
    const signature = await sign(privateKey, timestamp, '{"type":1}');

    const verified = await verifyDiscordSignature({
      signature,
      timestamp,
      body: '{"type":1}',
      publicKey: publicKeyHex,
      nowSeconds: 1_700_000_000 + 3600,
    });

    expect(verified).toBe(false);
  });

  it('rejects a timestamp that is too far in the future', async () => {
    const { publicKeyHex, privateKey } = await generateKeyPair();
    const timestamp = '1700000000';
    const signature = await sign(privateKey, timestamp, '{"type":1}');

    const verified = await verifyDiscordSignature({
      signature,
      timestamp,
      body: '{"type":1}',
      publicKey: publicKeyHex,
      nowSeconds: 1_700_000_000 - 3600,
    });

    expect(verified).toBe(false);
  });

  it('rejects a malformed signature', async () => {
    const { publicKeyHex } = await generateKeyPair();
    const verified = await verifyDiscordSignature({
      signature: 'not hex',
      timestamp: '1700000000',
      body: '{"type":1}',
      publicKey: publicKeyHex,
      nowSeconds: 1_700_000_000,
    });
    expect(verified).toBe(false);
  });

  it('rejects a malformed public key', async () => {
    const { privateKey } = await generateKeyPair();
    const timestamp = '1700000000';
    const signature = await sign(privateKey, timestamp, '{"type":1}');
    const verified = await verifyDiscordSignature({
      signature,
      timestamp,
      body: '{"type":1}',
      publicKey: 'abcd',
      nowSeconds: 1_700_000_000,
    });
    expect(verified).toBe(false);
  });

  it('rejects a timestamp that is not a number', async () => {
    const { publicKeyHex } = await generateKeyPair();
    const verified = await verifyDiscordSignature({
      signature: '00'.repeat(64),
      timestamp: 'not a number',
      body: '{"type":1}',
      publicKey: publicKeyHex,
      nowSeconds: 1_700_000_000,
    });
    expect(verified).toBe(false);
  });
});
