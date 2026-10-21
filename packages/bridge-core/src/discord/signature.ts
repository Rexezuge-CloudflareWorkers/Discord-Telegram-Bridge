/**
 * Verifying Discord's Ed25519 request signatures.
 *
 * Discord signs every interaction request with the application's private key
 * and sends the signature and the timestamp in two headers. The signed message
 * is the timestamp concatenated with the **raw** request body — so the body
 * has to be read as text before it is parsed, because re-serialising a parsed
 * object does not reproduce the bytes Discord signed.
 *
 * The verification never throws. A request that fails any check is a request
 * this bridge did not receive from Discord, and the caller's answer to that is
 * a 401, not an exception.
 */

/**
 * How old a signed request may be.
 *
 * Discord's own guidance is to reject a timestamp more than five minutes old:
 * without a freshness window a signature captured once would be valid
 * forever, which turns a signed-request scheme into a bearer-token scheme.
 */
export const DISCORD_SIGNATURE_MAX_AGE_SECONDS = 300;

/**
 * How far in the future a timestamp may be.
 *
 * A small allowance for clock skew between Discord and the Worker. It is
 * deliberately small: the allowance exists to absorb drift, not to accept a
 * request nobody could have sent yet.
 */
export const DISCORD_SIGNATURE_CLOCK_SKEW_SECONDS = 60;

/**
 * The headers Discord signs with.
 */
export const DISCORD_SIGNATURE_HEADER = 'x-signature-ed25519';
export const DISCORD_TIMESTAMP_HEADER = 'x-signature-timestamp';

/**
 * What a verification needs.
 */
export interface DiscordSignatureInput {
  /**
   * The `X-Signature-Ed25519` header: the signature, hex-encoded.
   */
  readonly signature: string;
  /**
   * The `X-Signature-Timestamp` header: Unix seconds.
   */
  readonly timestamp: string;
  /**
   * The raw request body, exactly as it arrived.
   */
  readonly body: string;
  /**
   * The application's public key, hex-encoded.
   */
  readonly publicKey: string;
  /**
   * The current time, in Unix seconds.
   */
  readonly nowSeconds: number;
  /**
   * How old a signed request may be. Defaults to five minutes.
   */
  readonly maxAgeSeconds?: number;
}

/**
 * Whether a Discord request carries a valid signature.
 *
 * @returns `true` only when the signature verifies **and** the timestamp is
 * fresh. Every other outcome is `false`.
 */
export async function verifyDiscordSignature(input: DiscordSignatureInput): Promise<boolean> {
  const maxAge = input.maxAgeSeconds ?? DISCORD_SIGNATURE_MAX_AGE_SECONDS;
  const timestamp = Number(input.timestamp);
  if (
    !Number.isInteger(timestamp) ||
    input.nowSeconds - timestamp > maxAge ||
    timestamp - input.nowSeconds > DISCORD_SIGNATURE_CLOCK_SKEW_SECONDS
  ) {
    return false;
  }

  const signature = hexToBytes(input.signature);
  const publicKey = hexToBytes(input.publicKey);
  if (signature === null || publicKey === null) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey('raw', publicKey, 'Ed25519', false, ['verify']);
    const signed = new TextEncoder().encode(input.timestamp + input.body);
    return await crypto.subtle.verify('Ed25519', key, signature, signed);
  } catch {
    // A malformed key or an unsupported algorithm is a failed verification, not
    // a crash: the request is not from Discord either way.
    return false;
  }
}

/**
 * Decode a hex string into bytes, or `null` when it is not valid hex.
 *
 * The return type names the backing buffer rather than leaving it to
 * inference: the Web Crypto API takes a `BufferSource`, which is an
 * `ArrayBuffer`-backed view, and a `Uint8Array` that might be backed by a
 * `SharedArrayBuffer` is not one.
 */
export function hexToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    return null;
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const pair = value.slice(index * 2, index * 2 + 2);
    bytes[index] = Number.parseInt(pair, 16);
  }
  return bytes;
}
