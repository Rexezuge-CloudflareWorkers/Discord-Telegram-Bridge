import { discordMarkdownToHtml } from '../discord/markdown';
import type { DiscordEmbed, DiscordMessageModel } from '../discord/types';
import { escapeHtml } from './escape';
import { BRIDGE_MAX_TEXT_LENGTH, splitText, splitTextWithFirstBudget } from './split';
import type { TelegramDelivery } from './types';

/**
 * Turning a Discord message into the Telegram messages that carry it.
 *
 * Telegram has no embeds and no author line, so a Discord message fans out:
 * the author and the body share the first message, and each embed becomes a
 * message of its own. Every message is rendered to Telegram's HTML subset
 * before it leaves this module — nothing downstream has to know what HTML
 * Telegram accepts.
 */

/**
 * How the bridge renders a message.
 */
export interface RenderOptions {
  /**
   * The largest visible text to put in one message.
   */
  readonly maxTextLength?: number;
  /**
   * Whether Telegram may render a link preview for the first link in a
   * message. Off by default: a bridged message is quoted content, and a
   * preview turns a forwarded line into a card.
   */
  readonly disableLinkPreview?: boolean;
}

/**
 * Render a Discord message into the Telegram messages that carry it.
 */
export function renderDeliveries(model: DiscordMessageModel, options: RenderOptions = {}): TelegramDelivery[] {
  const maxTextLength = options.maxTextLength ?? BRIDGE_MAX_TEXT_LENGTH;
  const disableLinkPreview = options.disableLinkPreview ?? true;
  const deliveries: TelegramDelivery[] = [];

  const author = model.author?.trim() ?? '';
  const content = model.content ?? '';

  if (author.length > 0 && content.length > 0) {
    const authorHtml = `<b>${escapeHtml(author)}</b>`;
    // The author shares the first message with the body, so the first chunk
    // of the body has to leave room for it.
    const firstBudget = Math.max(1, maxTextLength - author.length - 1);
    const chunks = splitTextWithFirstBudget(content, firstBudget, maxTextLength);
    chunks.forEach((chunk, index) => {
      const body = discordMarkdownToHtml(chunk);
      deliveries.push({
        text: index === 0 ? `${authorHtml}\n${body}` : body,
        disableLinkPreview,
      });
    });
  } else if (author.length > 0) {
    deliveries.push({ text: `<b>${escapeHtml(author)}</b>`, disableLinkPreview });
  } else if (content.length > 0) {
    for (const chunk of splitText(content, maxTextLength)) {
      deliveries.push({ text: discordMarkdownToHtml(chunk), disableLinkPreview });
    }
  }

  for (const embed of model.embeds ?? []) {
    deliveries.push(...renderEmbedDeliveries(embed, maxTextLength, disableLinkPreview));
  }

  return deliveries;
}

/**
 * Render one embed as a Telegram message.
 *
 * An embed is a card, and a card does not split: a message broken across two
 * Telegram messages is two messages, and a reader cannot tell that they were
 * one card. The embed is therefore truncated to fit rather than split, and
 * the truncation is visible — the text ends in an ellipsis.
 */
function renderEmbedDeliveries(embed: DiscordEmbed, maxTextLength: number, disableLinkPreview: boolean): TelegramDelivery[] {
  const title = embed.title ?? '';
  const url = embed.url ?? '';
  const author = embed.author?.name ?? '';
  const footer = embed.footer?.text ?? '';

  const headerParts: string[] = [];
  if (title.length > 0) {
    headerParts.push(`<b>${escapeHtml(title)}</b>`);
  }
  if (url.length > 0) {
    headerParts.push(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
  }
  if (author.length > 0) {
    headerParts.push(`<i>${escapeHtml(author)}</i>`);
  }

  const footerText = footer.length > 0 ? `<i>${escapeHtml(footer)}</i>` : '';

  // Everything that is not the description or the fields: the header, the
  // footer, and the newlines between them.
  const fixedLength =
    headerParts.reduce((total, part) => total + part.length, 0) +
    footerText.length +
    (headerParts.length > 0 && footerText.length > 0 ? 1 : 0);

  let remaining = Math.max(0, maxTextLength - fixedLength - 1);

  const bodyParts: string[] = [];

  const descriptionSource = embed.description ?? '';
  if (descriptionSource.length > 0 && remaining > 0) {
    const truncated = truncatePlain(descriptionSource, remaining);
    remaining -= truncated.length;
    bodyParts.push(discordMarkdownToHtml(truncated));
  }

  for (const field of embed.fields ?? []) {
    if (remaining <= 0) {
      break;
    }
    const fieldName = field.name ?? '';
    const fieldValue = field.value ?? '';
    const nameLength = fieldName.length > 0 ? fieldName.length + 1 : 0;
    const truncatedValue = truncatePlain(fieldValue, Math.max(0, remaining - nameLength));
    remaining -= truncatedValue.length + nameLength;
    const renderedName = fieldName.length > 0 ? `<b>${escapeHtml(fieldName)}</b>` : '';
    const renderedValue = truncatedValue.length > 0 ? discordMarkdownToHtml(truncatedValue) : '';
    const combined = [renderedName, renderedValue].filter((part) => part.length > 0).join('\n');
    if (combined.length > 0) {
      bodyParts.push(combined);
    }
  }

  const parts = [...headerParts, ...bodyParts];
  if (footerText.length > 0) {
    parts.push(footerText);
  }
  const text = parts.join('\n');

  return text.length > 0 ? [{ text, disableLinkPreview }] : [];
}

/**
 * Cut plain text to a budget, marking the cut with an ellipsis.
 *
 * The budget counts source characters, which is an upper bound on the visible
 * characters Telegram counts: markup adds characters to the wire form but
 * none to the text a reader sees.
 */
function truncatePlain(text: string, budget: number): string {
  if (budget <= 0) {
    return '';
  }
  if (text.length <= budget) {
    return text;
  }
  return `${text.slice(0, Math.max(0, budget - 1))}…`;
}
