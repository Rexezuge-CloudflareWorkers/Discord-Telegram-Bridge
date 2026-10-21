/**
 * The Discord shapes this bridge reads.
 *
 * Every field is optional: Discord omits what it has nothing to say about, and
 * the parsers normalise the `null`s it does send into *absent*. A field that
 * is genuinely required for a given payload — a webhook's `content` — is
 * checked by the parser that reads it, not by the type.
 */

/**
 * One field of a Discord embed.
 */
export interface DiscordEmbedField {
  readonly name?: string;
  readonly value?: string;
  readonly inline?: boolean;
}

/**
 * The author line of a Discord embed.
 */
export interface DiscordEmbedAuthor {
  readonly name?: string;
  readonly url?: string;
}

/**
 * The footer of a Discord embed.
 */
export interface DiscordEmbedFooter {
  readonly text?: string;
  readonly icon_url?: string;
}

/**
 * A Discord embed — the rich card a message can carry.
 */
export interface DiscordEmbed {
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly color?: number;
  readonly fields?: readonly DiscordEmbedField[];
  readonly footer?: DiscordEmbedFooter;
  readonly author?: DiscordEmbedAuthor;
  readonly timestamp?: string;
}

/**
 * The metadata of one attachment.
 *
 * The bytes are not here: an attachment posted as multipart arrives as a
 * separate part, and one referenced by URL has to be fetched. Either way the
 * bytes are the application's business, not the parser's.
 */
export interface DiscordAttachment {
  readonly id?: string;
  readonly filename?: string;
  readonly content_type?: string;
  readonly size?: number;
  readonly url?: string;
  readonly proxy_url?: string;
}

/**
 * The body Discord's Execute Webhook accepts.
 */
export interface DiscordWebhookPayload {
  readonly content?: string;
  readonly username?: string;
  readonly avatar_url?: string;
  readonly tts?: boolean;
  readonly embeds?: readonly DiscordEmbed[];
  readonly attachments?: readonly DiscordAttachment[];
}

/**
 * A Discord user.
 */
export interface DiscordUser {
  readonly id?: string;
  readonly username?: string;
  readonly global_name?: string;
  readonly discriminator?: string;
  readonly avatar?: string;
  readonly bot?: boolean;
}

/**
 * A Discord guild member.
 */
export interface DiscordMember {
  readonly user?: DiscordUser;
  readonly nick?: string;
}

/**
 * One option of an application command.
 */
export interface DiscordInteractionOption {
  readonly name?: string;
  readonly type?: number;
  readonly value?: string;
}

/**
 * A message an interaction resolved.
 */
export interface DiscordInteractionMessage {
  readonly id?: string;
  readonly content?: string;
  readonly attachments?: readonly DiscordAttachment[];
}

/**
 * The data half of an interaction.
 */
export interface DiscordInteractionData {
  readonly id?: string;
  readonly name?: string;
  readonly type?: number;
  readonly options?: readonly DiscordInteractionOption[];
  readonly resolved?: {
    readonly messages?: readonly DiscordInteractionMessage[];
  };
}

/**
 * The payload Discord posts to an Interactions Endpoint.
 */
export interface DiscordInteraction {
  readonly id?: string;
  readonly application_id?: string;
  readonly type?: number;
  readonly token?: string;
  readonly version?: number;
  readonly timestamp?: string;
  readonly guild_id?: string;
  readonly channel_id?: string;
  readonly locale?: string;
  readonly member?: DiscordMember;
  readonly user?: DiscordUser;
  readonly data?: DiscordInteractionData;
}

/**
 * The message this bridge forwards, independent of where it came from.
 *
 * A webhook payload and an interaction reduce to the same three things: who
 * said it, what they said, and what cards they attached. Normalising to one
 * model is what lets one renderer serve both inbound surfaces.
 */
export interface DiscordMessageModel {
  readonly author?: string;
  readonly content?: string;
  readonly embeds?: readonly DiscordEmbed[];
  readonly attachments?: readonly DiscordAttachment[];
}
