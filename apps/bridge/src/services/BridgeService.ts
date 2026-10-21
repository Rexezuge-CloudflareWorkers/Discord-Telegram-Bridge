import { NotFoundError } from '@rexezuge/errors';
import { renderDeliveries, resolveRoute } from '@discord-telegram-bridge/bridge-core';
import type { DiscordMessageModel, RouteSource, TelegramOutboundFile } from '@discord-telegram-bridge/bridge-core';
import { DiscordAttachmentClient, isPhoto } from '../clients/DiscordAttachmentClient';
import type { RouteStore } from '../clients/RouteStore';
import type { TelegramClient } from '../clients/TelegramClient';

/**
 * The bridge's orchestration.
 *
 * The service answers one question — *where does this Discord message go, and
 * what does it become on the way* — and it is the only place that knows the
 * order of the steps: resolve the destination, render the message, send the
 * text, then send whatever files came with it.
 */

/**
 * What the service needs to do its work.
 */
export interface BridgeServiceDependencies {
  readonly telegram: TelegramClient;
  readonly routes: RouteStore;
  readonly attachments: DiscordAttachmentClient;
  /**
   * The chat to use when no route matches, or `null` when there is none.
   */
  readonly defaultChatId: string | null;
}

/**
 * What a forward did.
 */
export interface ForwardResult {
  readonly chatId: string;
  readonly source: RouteSource;
  readonly messages: number;
  readonly attachments: number;
}

/**
 * Relays Discord messages to Telegram.
 */
export class BridgeService {
  private readonly telegram: TelegramClient;
  private readonly routes: RouteStore;
  private readonly attachments: DiscordAttachmentClient;
  private readonly defaultChatId: string | null;

  constructor(dependencies: BridgeServiceDependencies) {
    this.telegram = dependencies.telegram;
    this.routes = dependencies.routes;
    this.attachments = dependencies.attachments;
    this.defaultChatId = dependencies.defaultChatId;
  }

  /**
   * Relay one Discord message.
   *
   * @param model - The message to relay.
   * @param candidates - The route keys to try, in order of preference.
   * @param inlineFiles - The files uploaded with the request, in the order
   * they arrived.
   * @throws NotFoundError when no destination is configured for the source.
   */
  async forward(model: DiscordMessageModel, candidates: readonly string[], inlineFiles: readonly File[] = []): Promise<ForwardResult> {
    const routes = await this.routes.loadAll();
    const route = resolveRoute(routes, candidates, this.defaultChatId);
    if (route === null) {
      throw new NotFoundError('No Telegram destination is configured for this Discord source.');
    }

    const deliveries = renderDeliveries(model);
    for (const delivery of deliveries) {
      await this.telegram.sendText(route.chatId, delivery, route.threadId);
    }

    const files = await this.collectFiles(model, inlineFiles);
    if (files.length > 0 && deliveries.length === 0) {
      // The message was nothing but attachments. Telegram needs something to
      // attach them to, so the reader is told what arrived.
      await this.telegram.sendText(
        route.chatId,
        { text: `<b>${model.author ?? 'Attachment'}</b>`, disableLinkPreview: true },
        route.threadId,
      );
    }

    for (const file of files) {
      await this.sendFile(route.chatId, file, route.threadId);
    }

    return {
      chatId: route.chatId,
      source: route.source,
      messages: deliveries.length,
      attachments: files.length,
    };
  }

  /**
   * Gather the files that travel with a message.
   *
   * A file uploaded with the request is used as-is; a file that is only
   * referenced by URL is fetched. The two are matched by position, which is
   * the order Discord itself uses.
   */
  private async collectFiles(model: DiscordMessageModel, inlineFiles: readonly File[]): Promise<TelegramOutboundFile[]> {
    const attachments = model.attachments ?? [];
    const files: TelegramOutboundFile[] = [];

    for (const [index, attachment] of attachments.entries()) {
      const inline = inlineFiles[index];
      if (inline !== undefined) {
        files.push(await toOutboundFile(inline, attachment.filename));
        continue;
      }
      const downloaded = await this.attachments.download(attachment);
      if (downloaded !== null) {
        files.push(downloaded);
      }
    }

    // Files uploaded without metadata: Discord's own `attachments` array is
    // absent when a caller posts a file and no description.
    for (const [index, inline] of inlineFiles.entries()) {
      if (index < attachments.length) {
        continue;
      }
      files.push(await toOutboundFile(inline));
    }

    return files;
  }

  /**
   * Send one file, as a photo when Telegram will take it and as a document
   * when it will not.
   */
  private async sendFile(chatId: string, file: TelegramOutboundFile, threadId?: number): Promise<void> {
    if (isPhoto(file)) {
      try {
        await this.telegram.sendPhoto(chatId, file, file.filename, threadId);
        return;
      } catch {
        // Telegram refused the photo — most often because the bytes are not an
        // image the decoder accepts. The document path takes the same bytes.
      }
    }
    await this.telegram.sendDocument(chatId, file, file.filename, threadId);
  }
}

/**
 * Read an uploaded file into the shape the Telegram client sends.
 */
async function toOutboundFile(file: File, filename?: string): Promise<TelegramOutboundFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    filename: filename ?? file.name ?? 'attachment',
    contentType: file.type.length > 0 ? file.type : 'application/octet-stream',
    bytes,
  };
}
