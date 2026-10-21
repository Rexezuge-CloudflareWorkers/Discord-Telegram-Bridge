/**
 * The shapes the bridge hands to Telegram.
 *
 * These are the bridge's own vocabulary, not the Bot API's wire format: the
 * application layer owns `chat_id`, `parse_mode` and the multipart envelope,
 * because those are properties of a *delivery* — who receives it, how it is
 * encoded, what file rides along — rather than of the text.
 */

/**
 * One outbound message.
 */
export interface TelegramDelivery {
  /**
   * The message body, already rendered to Telegram's HTML subset.
   */
  readonly text: string;
  /**
   * Whether Telegram may render a link preview for the first link in the text.
   *
   * Off by default: a bridged message is quoted content, and a preview turns a
   * forwarded line into a large card that buries the rest of the message.
   */
  readonly disableLinkPreview: boolean;
}

/**
 * A file to upload alongside a message.
 */
export interface TelegramOutboundFile {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}
