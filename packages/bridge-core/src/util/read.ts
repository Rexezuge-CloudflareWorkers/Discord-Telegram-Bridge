/**
 * Reading untrusted JSON into the repo's vocabulary.
 *
 * Discord's payloads are null-heavy: an absent `avatar_url` arrives as
 * `"avatar_url": null` rather than as a missing key, and `username` is `null`
 * on the interaction payload where a webhook has it. The kit's rule is one
 * vocabulary — `null` means absent, `undefined` means not supplied — so every
 * `null` is normalised to *absent* here, at the boundary, rather than being
 * carried inward as a third state.
 */

/**
 * Drop the keys whose value is `undefined`.
 *
 * An optional property on a returned object must be **omitted**, not set to
 * `undefined`: an explicit `undefined` key serialises differently from an
 * absent one, and the two are not interchangeable once the value crosses a
 * JSON boundary.
 */
export function compact<T extends object>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = entry;
    }
  }
  return result as T;
}

/**
 * Read a string, treating both a missing key and an explicit `null` as absent.
 */
export function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read a number, treating both a missing key and an explicit `null` as absent.
 */
export function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Read a boolean, treating both a missing key and an explicit `null` as absent.
 */
export function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Read a plain object, treating a missing key, an explicit `null` and a
 * non-object value as absent.
 */
export function readObject(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = source[key];
  return isPlainObject(value) ? value : undefined;
}

/**
 * Read an array, treating a missing key, an explicit `null` and a non-array
 * value as absent.
 */
export function readArray(source: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = source[key];
  return Array.isArray(value) ? value : undefined;
}

/**
 * Whether a value is a plain object — not an array, not `null`.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
