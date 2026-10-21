import { BadGatewayError, BadRequestError, ForbiddenError, NotFoundError, RateLimitedError, UnauthorizedError } from '@rexezuge/errors';
import type { ServiceError } from '@rexezuge/errors';
import { isPlainObject } from '@discord-telegram-bridge/bridge-core';
import type { TelegramDelivery, TelegramOutboundFile } from '@discord-telegram-bridge/bridge-core';

/**
 * The Telegram Bot API client.
 *
 * Thin on purpose: it knows the wire format and how to read the API's
 * failures, and nothing about what a message says. The Bot API answers every
 * call with `{ ok, result }` or `{ ok: false, error_code, description }`, so
 * the whole error surface of this client is the translation of one of those
 * two shapes into the repository's error taxonomy.
 */

/**
 * The public Telegram Bot API endpoint.
 */
export const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

/**
 * How the client is built.
 */
export interface TelegramClientOptions {
  /**
   * The bot token from BotFather.
   */
  readonly botToken: string;
  /**
   * The `fetch` implementation to use. Injectable so a test can answer the
   * API without a network.
   */
  readonly fetchImpl?: typeof fetch;
  /**
   * The API root. Defaults to the public endpoint.
   */
  readonly baseUrl?: string;
}

/**
 * A client for the Telegram Bot API.
 */
export class TelegramClient {
  private readonly botToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: TelegramClientOptions) {
    this.botToken = options.botToken;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.baseUrl = options.baseUrl ?? TELEGRAM_API_BASE_URL;
  }

  /**
   * Send a text message.
   */
  async sendText(chatId: string, delivery: TelegramDelivery, threadId?: number): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: delivery.text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: delivery.disableLinkPreview },
    };
    if (threadId !== undefined) {
      body['message_thread_id'] = threadId;
    }
    await this.call('sendMessage', body);
  }

  /**
   * Send an image.
   */
  async sendPhoto(chatId: string, file: TelegramOutboundFile, caption: string, threadId?: number): Promise<void> {
    const form = new FormData();
    form.set('chat_id', chatId);
    if (caption.length > 0) {
      form.set('caption', caption);
    }
    form.set('photo', toFile(file));
    await this.callMultipart('sendPhoto', form, threadId);
  }

  /**
   * Send any other file.
   */
  async sendDocument(chatId: string, file: TelegramOutboundFile, caption: string, threadId?: number): Promise<void> {
    const form = new FormData();
    form.set('chat_id', chatId);
    if (caption.length > 0) {
      form.set('caption', caption);
    }
    form.set('document', toFile(file));
    await this.callMultipart('sendDocument', form, threadId);
  }

  /**
   * Call a JSON method and translate its failure.
   */
  private async call(method: string, body: Record<string, unknown>): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      return;
    }
    throw await this.toServiceError(response);
  }

  /**
   * Call a multipart method and translate its failure.
   */
  private async callMultipart(method: string, form: FormData, threadId?: number): Promise<void> {
    if (threadId !== undefined) {
      form.set('message_thread_id', String(threadId));
    }
    const response = await this.fetchImpl(`${this.baseUrl}/bot${this.botToken}/${method}`, {
      method: 'POST',
      body: form,
    });
    if (response.ok) {
      return;
    }
    throw await this.toServiceError(response);
  }

  /**
   * Translate an API failure into the repository's taxonomy.
   *
   * The API's own description is kept for the statuses whose message is safe
   * to show — a 400 from Telegram names the field it objected to, and that
   * sentence is the whole diagnosis. A 5xx description is dropped for the
   * generic one, because a gateway failure's body is not the reader's
   * business.
   */
  private async toServiceError(response: Response): Promise<ServiceError> {
    const description = await readDescription(response);
    switch (response.status) {
      case 400: {
        return new BadRequestError(description);
      }
      case 401: {
        return new UnauthorizedError(description);
      }
      case 403: {
        return new ForbiddenError(description);
      }
      case 404: {
        return new NotFoundError(description);
      }
      case 429: {
        return new RateLimitedError(description);
      }
      default: {
        return response.status >= 500 ? new BadGatewayError(description) : new BadRequestError(description);
      }
    }
  }
}

/**
 * Wrap the bytes in a `File` the multipart encoder can send.
 *
 * The copy is deliberate: a `Uint8Array` may be a view over a larger buffer,
 * and the encoder would then send the whole buffer rather than the view.
 */
function toFile(file: TelegramOutboundFile): File {
  const bytes = new Uint8Array(file.bytes);
  return new File([bytes], file.filename, { type: file.contentType });
}

/**
 * Read the API's description of a failure.
 */
async function readDescription(response: Response): Promise<string> {
  let description: string | undefined;
  try {
    const body: unknown = await response.json();
    if (isPlainObject(body)) {
      const value = body['description'];
      if (typeof value === 'string' && value.length > 0) {
        description = value;
      }
    }
  } catch {
    // The body was not JSON. The status still names the failure.
  }
  return description ?? `The Telegram API responded with ${response.status}.`;
}
