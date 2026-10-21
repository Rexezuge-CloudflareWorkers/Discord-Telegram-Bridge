/**
 * Splitting a message into the pieces Telegram will accept.
 *
 * Telegram caps `sendMessage` text at 4096 characters **after entity parsing**
 * — the visible text, not the markup. The cap is measured against the text a
 * reader sees, so the split is computed on the plain text and the markup is
 * produced afterwards, per chunk.
 */

/**
 * The largest visible text Telegram accepts in one message.
 */
export const TELEGRAM_MAX_TEXT_LENGTH = 4096;

/**
 * The largest visible text this bridge puts in one message.
 *
 * Below Telegram's own cap on purpose: a chunk that lands exactly on the cap
 * leaves no room for the author line that precedes it, and the cap is counted
 * after entity parsing, so a message whose visible text is exactly 4096
 * characters is one character away from being rejected.
 */
export const BRIDGE_MAX_TEXT_LENGTH = 4000;

/**
 * Split text into chunks of at most `maxLength` visible characters.
 *
 * The break is taken at the last whitespace at or before the limit, so a word
 * is not cut in half. Text with no whitespace at that boundary is cut hard
 * instead: a chunk longer than the limit is rejected by Telegram outright,
 * whereas a cut word is merely ugly.
 */
export function splitText(text: string, maxLength: number): string[] {
  if (maxLength < 1) {
    throw new RangeError('maxLength must be at least 1.');
  }
  if (text.length <= maxLength) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const cut = findBreak(remaining, maxLength);
    chunks.push(remaining.slice(0, cut));
    remaining = trimLeadingWhitespace(remaining.slice(cut));
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

/**
 * Split text where the first chunk gets a smaller budget than the rest.
 *
 * The author line is rendered ahead of the message body and shares the first
 * message with it, so the first chunk has to leave room for the author's
 * visible length. Every later chunk gets the full budget.
 */
export function splitTextWithFirstBudget(text: string, firstBudget: number, maxLength: number): string[] {
  if (firstBudget < 1) {
    throw new RangeError('firstBudget must be at least 1.');
  }
  if (text.length === 0) {
    return [];
  }
  const firstCut = Math.min(firstBudget, text.length);
  const firstChunk = firstCut >= text.length ? text : text.slice(0, findBreak(text, firstCut));
  const rest = trimLeadingWhitespace(text.slice(firstChunk.length));
  const chunks = [firstChunk];
  if (rest.length > 0) {
    chunks.push(...splitText(rest, maxLength));
  }
  return chunks;
}

/**
 * The index to cut at: the last whitespace at or before `limit`, or the limit
 * itself when the text has none there.
 */
function findBreak(text: string, limit: number): number {
  const index = text.lastIndexOf(' ', limit);
  return index > 0 ? index : limit;
}

/**
 * Drop the whitespace a cut left at the head of the remaining text.
 */
function trimLeadingWhitespace(text: string): string {
  return text.replace(/^\s+/, '');
}
