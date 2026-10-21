import { escapeHtml } from '../telegram/escape';

/**
 * The inline half of Discord markdown → Telegram HTML.
 *
 * Discord's markdown and Telegram's HTML are not the same language: Discord
 * has no underline, Telegram has no strikethrough shorthand of its own, and
 * the two disagree about what a lone `*` means. The conversion is therefore a
 * re-expression rather than a transliteration — every construct Discord
 * understands is mapped onto the tag Telegram understands, and anything the
 * converter does not recognise is escaped and shown literally.
 *
 * The escaping happens first and the tags are added afterwards, so user text
 * can never inject markup: `<script>` in a Discord message arrives in
 * Telegram as the six characters a reader sees, not as a tag.
 */

/**
 * The markers the scanner looks for, longest first at any given index.
 */
const MARKERS = ['```', '***', '___', '**', '__', '~~', '||', '`', '*', '_', '['] as const;

type Marker = (typeof MARKERS)[number];

/**
 * A marker found in the source.
 */
interface MarkerMatch {
  readonly index: number;
  readonly marker: Marker;
}

/**
 * A rendered construct and where the scan resumes.
 */
interface RenderedConstruct {
  readonly html: string;
  readonly next: number;
}

/**
 * Render one run of text, with no block-level constructs.
 */
export function renderInline(text: string): string {
  let output = '';
  let index = 0;

  while (index < text.length) {
    const match = findNextMarker(text, index);
    if (match === null) {
      output += escapeHtml(text.slice(index));
      break;
    }
    output += escapeHtml(text.slice(index, match.index));
    const rendered = renderConstruct(text, match);
    if (rendered === null) {
      // Not a construct after all — a lone `*`, an unmatched `_`. Shown as the
      // literal characters the reader would see on Discord.
      output += escapeHtml(match.marker);
      index = match.index + match.marker.length;
      continue;
    }
    output += rendered.html;
    index = rendered.next;
  }

  return output;
}

/**
 * The earliest marker at or after `from`, preferring the longest one when two
 * start at the same index — `**` over `*`, ```` ``` ```` over `` ` ``.
 */
function findNextMarker(text: string, from: number): MarkerMatch | null {
  let best: MarkerMatch | null = null;
  for (const marker of MARKERS) {
    const index = text.indexOf(marker, from);
    if (index === -1) {
      continue;
    }
    if (best === null || index < best.index || (index === best.index && marker.length > best.marker.length)) {
      best = { index, marker };
    }
  }
  return best;
}

/**
 * Render the construct that starts at `match`, or `null` when the marker turns
 * out not to open one.
 */
function renderConstruct(text: string, match: MarkerMatch): RenderedConstruct | null {
  switch (match.marker) {
    case '```': {
      return renderFencedCode(text, match.index);
    }
    case '`': {
      return renderInlineCode(text, match.index);
    }
    case '***':
    case '___': {
      return renderWrapped(text, match.index, match.marker, 'b', 'i');
    }
    case '**':
    case '__': {
      return renderWrapped(text, match.index, match.marker, 'b');
    }
    case '~~': {
      return renderWrapped(text, match.index, '~~', 's');
    }
    case '||': {
      return renderWrapped(text, match.index, '||', 'tg-spoiler');
    }
    case '*': {
      return renderWrapped(text, match.index, '*', 'i');
    }
    case '_': {
      return renderUnderscoreEmphasis(text, match.index);
    }
    case '[': {
      return renderLink(text, match.index);
    }
    default: {
      return null;
    }
  }
}

/**
 * A fenced code block: its content is literal, so nothing inside it is
 * rendered as markdown.
 */
function renderFencedCode(text: string, index: number): RenderedConstruct | null {
  const closeIndex = text.indexOf('```', index + 3);
  if (closeIndex === -1) {
    return null;
  }
  const content = text.slice(index + 3, closeIndex);
  return { html: `<code>${escapeHtml(content)}</code>`, next: closeIndex + 3 };
}

/**
 * Inline code: also literal, and its content may not contain a backtick.
 */
function renderInlineCode(text: string, index: number): RenderedConstruct | null {
  const closeIndex = text.indexOf('`', index + 1);
  if (closeIndex === -1) {
    return null;
  }
  const content = text.slice(index + 1, closeIndex);
  return { html: `<code>${escapeHtml(content)}</code>`, next: closeIndex + 1 };
}

/**
 * A construct that wraps its content in a tag: bold, strikethrough, spoiler or
 * italic. The content is rendered recursively, so nested constructs work.
 *
 * A second tag is used for the triple markers — Discord reads `***text***` as
 * bold *and* italic, and the two tags have to nest for Telegram to read it the
 * same way.
 */
function renderWrapped(text: string, index: number, marker: string, tag: string, innerTag?: string): RenderedConstruct | null {
  const closeIndex = text.indexOf(marker, index + marker.length);
  if (closeIndex === -1) {
    return null;
  }
  const content = text.slice(index + marker.length, closeIndex);
  if (content.length === 0) {
    return null;
  }
  const rendered = renderInline(content);
  const inner = innerTag === undefined ? rendered : `<${innerTag}>${rendered}</${innerTag}>`;
  return { html: `<${tag}>${inner}</${tag}>`, next: closeIndex + marker.length };
}

/**
 * Underscore emphasis.
 *
 * Discord does not italicise `snake_case`, so an underscore that opens or
 * closes inside a word is not a construct. Without that rule every identifier
 * in a forwarded log line would lose half its underscores to italics.
 */
function renderUnderscoreEmphasis(text: string, index: number): RenderedConstruct | null {
  const previous = index > 0 ? text.charAt(index - 1) : '';
  if (isWordCharacter(previous)) {
    return null;
  }
  const closeIndex = text.indexOf('_', index + 1);
  if (closeIndex === -1) {
    return null;
  }
  const following = text.charAt(closeIndex + 1);
  if (isWordCharacter(following)) {
    return null;
  }
  const content = text.slice(index + 1, closeIndex);
  if (content.length === 0) {
    return null;
  }
  return { html: `<i>${renderInline(content)}</i>`, next: closeIndex + 1 };
}

/**
 * A `[label](url)` link.
 *
 * The URL is checked before it is used: Telegram renders `href` verbatim, so a
 * `javascript:` target would otherwise survive the conversion untouched.
 */
function renderLink(text: string, index: number): RenderedConstruct | null {
  const labelEnd = text.indexOf(']', index + 1);
  if (labelEnd === -1 || text.charAt(labelEnd + 1) !== '(') {
    return null;
  }
  const urlEnd = text.indexOf(')', labelEnd + 2);
  if (urlEnd === -1) {
    return null;
  }
  const label = text.slice(index + 1, labelEnd);
  const url = text.slice(labelEnd + 2, urlEnd);
  if (!isSafeLink(url)) {
    // Not a link Telegram should follow. The label is still text worth showing.
    return { html: renderInline(label), next: urlEnd + 1 };
  }
  return { html: `<a href="${escapeHtml(url)}">${renderInline(label)}</a>`, next: urlEnd + 1 };
}

/**
 * Whether a URL uses a scheme Telegram is willing to follow.
 */
function isSafeLink(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^mailto:/i.test(url);
}

/**
 * Whether a character is part of a word — the test that keeps `snake_case`
 * from being read as emphasis.
 */
function isWordCharacter(character: string): boolean {
  return character.length > 0 && /[A-Z0-9]/i.test(character);
}
