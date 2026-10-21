import { describe, expect, it } from 'vitest';
import { parseWebhookPayload, parseInteraction, interactionAuthor, interactionText, isPing } from '@discord-telegram-bridge/bridge-core';

/**
 * Reading Discord's untrusted bodies.
 */
describe('parseWebhookPayload', () => {
  it('rejects a body that is not an object', () => {
    expect(() => parseWebhookPayload('a string')).toThrow(/JSON object/);
    expect(() => parseWebhookPayload(null)).toThrow(/JSON object/);
    expect(() => parseWebhookPayload([1, 2])).toThrow(/JSON object/);
  });

  it('reads the fields Discord sends', () => {
    const payload = parseWebhookPayload({
      content: 'hello',
      username: 'relay',
      embeds: [{ title: 'Card', fields: [{ name: 'a', value: 'b' }] }],
      attachments: [{ id: '1', filename: 'a.png', content_type: 'image/png', size: 10 }],
    });
    expect(payload.content).toBe('hello');
    expect(payload.username).toBe('relay');
    expect(payload.embeds?.[0]?.title).toBe('Card');
    expect(payload.embeds?.[0]?.fields?.[0]?.value).toBe('b');
    expect(payload.attachments?.[0]?.filename).toBe('a.png');
  });

  it('treats an explicit null as an absent field', () => {
    const payload = parseWebhookPayload({ content: null, username: 'relay' });
    expect('content' in payload).toBe(false);
    expect(payload.username).toBe('relay');
  });

  it('drops the fields that are not objects', () => {
    const payload = parseWebhookPayload({ embeds: ['nope', { title: 'Card' }], attachments: [null] });
    expect(payload.embeds).toHaveLength(1);
    expect(payload.attachments).toHaveLength(0);
  });
});

describe('parseInteraction', () => {
  it('rejects a body that is not an object', () => {
    expect(() => parseInteraction(42)).toThrow(/JSON object/);
  });

  it('recognises a ping', () => {
    expect(isPing(parseInteraction({ type: 1 }))).toBe(true);
    expect(isPing(parseInteraction({ type: 2 }))).toBe(false);
  });

  it('reads the author from the global name', () => {
    const interaction = parseInteraction({
      type: 2,
      member: { user: { username: 'alex', global_name: 'Alex A.' } },
    });
    expect(interactionAuthor(interaction)).toBe('Alex A.');
  });

  it('falls back to the username', () => {
    const interaction = parseInteraction({ type: 2, member: { user: { username: 'alex' } } });
    expect(interactionAuthor(interaction)).toBe('alex');
  });

  it('reads the text from the command options', () => {
    const interaction = parseInteraction({
      type: 2,
      data: { name: 'say', options: [{ name: 'text', value: 'hello there' }] },
    });
    expect(interactionText(interaction)).toBe('hello there');
  });

  it('falls back to the command name when there are no options', () => {
    const interaction = parseInteraction({ type: 2, data: { name: 'ping' } });
    expect(interactionText(interaction)).toBe('ping');
  });

  it('reads the attachments of a resolved message', () => {
    const interaction = parseInteraction({
      type: 2,
      data: {
        name: 'say',
        resolved: { messages: [{ id: '9', content: 'hi', attachments: [{ id: '1', filename: 'a.png' }] }] },
      },
    });
    expect(interaction.data?.resolved?.messages?.[0]?.attachments?.[0]?.filename).toBe('a.png');
  });
});
