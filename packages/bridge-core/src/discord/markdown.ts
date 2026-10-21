import { escapeHtml } from '../telegram/escape';
import { renderInline } from './markdownInline';

/**
 * Discord markdown → Telegram HTML, at the block level.
 *
 * A Discord message is a sequence of blocks — paragraphs, quotes, fenced code
 * — and each block becomes a Telegram block. The inline constructs inside a
 * block are handled by {@link renderInline}.
 */

/**
 * Render Discord markdown as Telegram HTML.
 */
export function discordMarkdownToHtml(source: string): string {
  const lines = source.split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = (lines[index] ?? '').trim();

    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trimStart().startsWith('```')) {
        body.push(lines[index] ?? '');
        index += 1;
      }
      // Step past the closing fence. An unterminated block runs to the end of
      // the message, which is what the reader would see on Discord too.
      index += 1;
      const classAttribute = language.length > 0 ? ` class="language-${escapeHtml(language)}"` : '';
      blocks.push(`<pre><code${classAttribute}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.startsWith('>')) {
      const body: string[] = [];
      while (index < lines.length) {
        const current = (lines[index] ?? '').trim();
        if (!current.startsWith('>')) {
          break;
        }
        body.push(current.slice(1).trim());
        index += 1;
      }
      blocks.push(`<blockquote>${renderInline(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (line.length === 0) {
      index += 1;
      continue;
    }

    const body: string[] = [];
    while (index < lines.length) {
      const current = (lines[index] ?? '').trim();
      if (current.length === 0 || current.startsWith('```') || current.startsWith('>')) {
        break;
      }
      body.push(current);
      index += 1;
    }
    blocks.push(renderInline(body.join('\n')));
  }

  return blocks.join('\n\n');
}
