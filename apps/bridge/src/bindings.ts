/**
 * Reading bindings that may or may not be configured.
 *
 * The wrangler template declares the optional settings with empty
 * placeholders, because a template cannot omit a variable that the deployment
 * might need. An empty string is therefore the shape "not configured" takes at
 * runtime, and every reader of an optional binding goes through here so that
 * shape is interpreted in exactly one place.
 */

/**
 * Read a binding as a string, treating an empty value as absent.
 */
export function readOptionalBinding(env: unknown, key: string): string | undefined {
  if (typeof env !== 'object' || env === null) {
    return undefined;
  }
  const value = (env as Record<string, unknown>)[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
