import { describe, expect, it } from 'vitest';
import { renderDeliveries } from '@discord-telegram-bridge/bridge-core';

/**
 * Turning a Discord message into Telegram messages.
 */
describe('renderDeliveries', () => {
  it('renders the author above the body', () => {
    const deliveries = renderDeliveries({ author: 'alex', content: 'hello' });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.text).toBe('<b>alex</b>\nhello');
  });

  it('renders a body with no author', () => {
    const deliveries = renderDeliveries({ content: 'hello' });
    expect(deliveries[0]?.text).toBe('hello');
  });

  it('renders an author with no body', () => {
    const deliveries = renderDeliveries({ author: 'alex' });
    expect(deliveries[0]?.text).toBe('<b>alex</b>');
  });

  it('renders nothing for an empty message', () => {
    expect(renderDeliveries({})).toEqual([]);
  });

  it('gives each embed a message of its own', () => {
    const deliveries = renderDeliveries({
      content: 'body',
      embeds: [{ title: 'One' }, { title: 'Two' }],
    });
    expect(deliveries).toHaveLength(3);
    expect(deliveries[1]?.text).toBe('<b>One</b>');
    expect(deliveries[2]?.text).toBe('<b>Two</b>');
  });

  it('renders an embed field and its value', () => {
    const deliveries = renderDeliveries({
      embeds: [{ fields: [{ name: 'Status', value: 'green' }] }],
    });
    expect(deliveries[0]?.text).toBe('<b>Status</b>\ngreen');
  });

  it('splits a body that is longer than one message', () => {
    const deliveries = renderDeliveries({ content: 'word '.repeat(2000) }, { maxTextLength: 200 });
    expect(deliveries.length).toBeGreaterThan(1);
    for (const delivery of deliveries) {
      expect(delivery.text.length).toBeLessThanOrEqual(400);
    }
  });

  it('leaves room for the author in the first message', () => {
    const deliveries = renderDeliveries({ author: 'alex', content: 'word '.repeat(200) }, { maxTextLength: 200 });
    const first = deliveries[0]?.text ?? '';
    expect(first.startsWith('<b>alex</b>')).toBe(true);
    expect(first.length).toBeLessThanOrEqual(200 + 20);
  });

  it('truncates an embed that is longer than one message', () => {
    const deliveries = renderDeliveries({ embeds: [{ description: 'x'.repeat(5000) }] }, { maxTextLength: 200 });
    expect(deliveries).toHaveLength(1);
    expect((deliveries[0]?.text ?? '').length).toBeLessThanOrEqual(200);
  });

  it('disables link previews by default', () => {
    const deliveries = renderDeliveries({ content: 'see https://example.com' });
    expect(deliveries[0]?.disableLinkPreview).toBe(true);
  });
});
