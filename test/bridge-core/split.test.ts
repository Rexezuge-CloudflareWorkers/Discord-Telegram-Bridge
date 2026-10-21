import { describe, expect, it } from 'vitest';
import { BRIDGE_MAX_TEXT_LENGTH, splitText, splitTextWithFirstBudget } from '@discord-telegram-bridge/bridge-core';

/**
 * Splitting a message into the pieces Telegram accepts.
 */
describe('splitText', () => {
  it('keeps a short text whole', () => {
    expect(splitText('short', 100)).toEqual(['short']);
  });

  it('breaks at whitespace rather than inside a word', () => {
    const chunks = splitText('one two three four', 10);
    expect(chunks).toEqual(['one two', 'three four']);
  });

  it('never exceeds the limit', () => {
    const chunks = splitText('word '.repeat(100), 20);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });

  it('cuts hard when there is no whitespace to break at', () => {
    const chunks = splitText('x'.repeat(25), 10);
    expect(chunks).toEqual(['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx']);
  });

  it('refuses a limit below one', () => {
    expect(() => splitText('text', 0)).toThrow(RangeError);
  });
});

describe('splitTextWithFirstBudget', () => {
  it('gives the first chunk the smaller budget', () => {
    const chunks = splitTextWithFirstBudget('one two three four five', 8, 100);
    expect(chunks[0]).toBe('one two');
    expect(chunks.slice(1).join(' ')).toBe('three four five');
  });

  it('keeps every chunk inside the larger budget', () => {
    const chunks = splitTextWithFirstBudget('word '.repeat(50), 10, 20);
    for (const chunk of chunks.slice(1)) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });

  it('returns nothing for empty text', () => {
    expect(splitTextWithFirstBudget('', 10, 20)).toEqual([]);
  });
});

describe('BRIDGE_MAX_TEXT_LENGTH', () => {
  it('stays below the limit Telegram enforces', () => {
    expect(BRIDGE_MAX_TEXT_LENGTH).toBeLessThan(4096);
  });
});
