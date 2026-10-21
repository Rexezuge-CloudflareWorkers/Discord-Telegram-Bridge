/**
 * HTML escaping for Telegram's HTML parse mode.
 *
 * Telegram's HTML mode understands a fixed tag set (`b`, `i`, `u`, `s`, `a`,
 * `code`, `pre`, `blockquote`, `tg-spoiler`) and nothing else. Every character
 * that could be read as a tag therefore has to be escaped before it reaches the
 * message, and the escaping has to happen *before* the formatting tags are
 * added — otherwise the tags themselves get escaped.
 */

const HTML_ESCAPES = new Map<string, string>([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/**
 * Escape the five characters that are meaningful in HTML.
 *
 * Used for both element text and attribute values, so the same function serves
 * message bodies and `href` targets.
 */
export function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"']/g, (character) => HTML_ESCAPES.get(character) ?? character);
}
