import { describe, expect, it } from 'vitest';
import { discordMarkdownToHtml } from '@discord-telegram-bridge/bridge-core';

/**
 * Discord markdown → Telegram HTML.
 *
 * The cases below are the constructs Discord renders and the ways a message
 * can try to smuggle markup past the conversion.
 */
describe('discordMarkdownToHtml', () => {
  it('renders bold and italic', () => {
    expect(discordMarkdownToHtml('**bold**')).toBe('<b>bold</b>');
    expect(discordMarkdownToHtml('*italic*')).toBe('<i>italic</i>');
    expect(discordMarkdownToHtml('__bold__')).toBe('<b>bold</b>');
  });

  it('renders bold and italic together', () => {
    expect(discordMarkdownToHtml('***both***')).toBe('<b><i>both</i></b>');
  });

  it('renders strikethrough and spoilers', () => {
    expect(discordMarkdownToHtml('~~gone~~')).toBe('<s>gone</s>');
    expect(discordMarkdownToHtml('||hidden||')).toBe('<tg-spoiler>hidden</tg-spoiler>');
  });

  it('renders inline code literally', () => {
    expect(discordMarkdownToHtml('`a ** b`')).toBe('<code>a ** b</code>');
  });

  it('renders a fenced code block literally', () => {
    expect(discordMarkdownToHtml('```js\nconst a = 1;\n```')).toBe('<pre><code class="language-js">const a = 1;</code></pre>');
  });

  it('renders a blockquote', () => {
    expect(discordMarkdownToHtml('> quoted')).toBe('<blockquote>quoted</blockquote>');
  });

  it('joins a multi-line quote into one block', () => {
    expect(discordMarkdownToHtml('> one\n> two')).toBe('<blockquote>one\ntwo</blockquote>');
  });

  it('renders a link', () => {
    expect(discordMarkdownToHtml('[docs](https://example.com/a)')).toBe('<a href="https://example.com/a">docs</a>');
  });

  it('refuses a link whose scheme is not one Telegram follows', () => {
    expect(discordMarkdownToHtml('[click](javascript:alert)')).toBe('click');
  });

  it('escapes the characters that would otherwise be markup', () => {
    expect(discordMarkdownToHtml('<b>not bold</b>')).toBe('&lt;b&gt;not bold&lt;/b&gt;');
    expect(discordMarkdownToHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes the ampersand in a link target', () => {
    expect(discordMarkdownToHtml('[x](https://example.com/?a=1&b=2)')).toBe('<a href="https://example.com/?a=1&amp;b=2">x</a>');
  });

  it('leaves an underscore inside a word alone', () => {
    expect(discordMarkdownToHtml('snake_case_name')).toBe('snake_case_name');
  });

  it('renders an underscore emphasis around a word', () => {
    expect(discordMarkdownToHtml('_emphasis_')).toBe('<i>emphasis</i>');
  });

  it('shows an unmatched marker literally', () => {
    expect(discordMarkdownToHtml('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(discordMarkdownToHtml('**unclosed')).toBe('**unclosed');
  });

  it('separates paragraphs with a blank line', () => {
    expect(discordMarkdownToHtml('one\n\ntwo')).toBe('one\n\ntwo');
  });

  it('nests a construct inside another', () => {
    expect(discordMarkdownToHtml('**bold with `code`**')).toBe('<b>bold with <code>code</code></b>');
  });
});
