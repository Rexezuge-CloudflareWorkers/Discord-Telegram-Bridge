import { BadRequestError } from '@rexezuge/errors';
import { compact, isPlainObject, readArray, readNumber, readString } from '../util/read';
import { parseAttachment } from './parseAttachment';
import type {
  DiscordAttachment,
  DiscordInteraction,
  DiscordInteractionData,
  DiscordInteractionMessage,
  DiscordInteractionOption,
  DiscordMember,
  DiscordUser,
} from './types';

/**
 * Reading Discord's Interactions Endpoint payloads.
 *
 * The interaction payload is the one Discord sends when a user runs a slash
 * command or clicks a component. It arrives signed (see `signature.ts`), and
 * the signature covers the *raw* body — so the body is read as text before it
 * is parsed, never re-serialised.
 */

/**
 * The interaction types this bridge understands.
 *
 * The numbers are Discord's, not ours: they are the wire values, and the
 * bridge's behaviour is keyed off them.
 */
export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

/**
 * Parse an interaction payload.
 *
 * @throws BadRequestError when the body is not a JSON object.
 */
export function parseInteraction(raw: unknown): DiscordInteraction {
  if (!isPlainObject(raw)) {
    throw new BadRequestError('The Discord interaction body must be a JSON object.');
  }
  const type = readNumber(raw, 'type');
  return {
    ...compact({
      id: readString(raw, 'id'),
      application_id: readString(raw, 'application_id'),
      token: readString(raw, 'token'),
      timestamp: readString(raw, 'timestamp'),
      guild_id: readString(raw, 'guild_id'),
      channel_id: readString(raw, 'channel_id'),
      locale: readString(raw, 'locale'),
      type,
    }),
    ...compact({
      member: parseMember(raw['member']),
      user: parseUser(raw['user']),
      data: parseInteractionData(raw['data']),
    }),
  };
}

/**
 * Whether an interaction is the PING Discord sends to validate an endpoint.
 */
export function isPing(interaction: DiscordInteraction): boolean {
  return interaction.type === INTERACTION_TYPE.PING;
}

/**
 * The channel an interaction came from, when it names one.
 */
export function interactionChannelId(interaction: DiscordInteraction): string | undefined {
  return interaction.channel_id;
}

/**
 * The display name of whoever triggered the interaction.
 *
 * Discord has several names for a person — a nickname, a global name, a
 * username — and they are not the same string. The global name is what the
 * person calls themselves, so it wins; the username is the fallback because it
 * is always present.
 */
export function interactionAuthor(interaction: DiscordInteraction): string | undefined {
  const member = interaction.member;
  const user = member?.user ?? interaction.user;
  const globalName = user?.global_name;
  if (globalName !== undefined && globalName.trim().length > 0) {
    return globalName.trim();
  }
  const nickname = member?.nick;
  if (nickname !== undefined && nickname.trim().length > 0) {
    return nickname.trim();
  }
  const username = user?.username;
  if (username !== undefined && username.trim().length > 0) {
    return username.trim();
  }
  return undefined;
}

/**
 * The text of the command that was run.
 *
 * A slash command's meaning is in its options — `/say hello there` says
 * "hello there" — so the option values are the message and the command name is
 * only used when the command carries no options at all.
 */
export function interactionText(interaction: DiscordInteraction): string {
  const options = interaction.data?.options ?? [];
  const values = options.map((option) => option.value).filter((value): value is string => value !== undefined && value.length > 0);
  if (values.length > 0) {
    return values.join(' ');
  }
  const name = interaction.data?.name;
  return name ?? '';
}

/**
 * The attachments of the message an interaction resolved, if any.
 *
 * A slash command invoked on a message resolves that message, and its
 * attachments come with it. The bridge cannot upload them — that needs a bot
 * token — so they are reported rather than forwarded, and the application
 * layer links to them.
 */
export function interactionAttachments(interaction: DiscordInteraction): readonly DiscordAttachment[] {
  const messages = interaction.data?.resolved?.messages ?? [];
  const first = messages[0];
  return first?.attachments ?? [];
}

/**
 * Parse the member half of an interaction.
 */
function parseMember(raw: unknown): DiscordMember | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  return compact({
    nick: readString(raw, 'nick'),
    user: parseUser(raw['user']),
  });
}

/**
 * Parse a user half of an interaction.
 */
function parseUser(raw: unknown): DiscordUser | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  return compact({
    id: readString(raw, 'id'),
    username: readString(raw, 'username'),
    global_name: readString(raw, 'global_name'),
    discriminator: readString(raw, 'discriminator'),
    avatar: readString(raw, 'avatar'),
    bot: typeof raw['bot'] === 'boolean' ? raw['bot'] : undefined,
  });
}

/**
 * Parse the data half of an interaction.
 */
function parseInteractionData(raw: unknown): DiscordInteractionData | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  return {
    ...compact({
      id: readString(raw, 'id'),
      name: readString(raw, 'name'),
      type: readNumber(raw, 'type'),
    }),
    ...compact({
      options: readArray(raw, 'options')
        ?.map((option) => parseOption(option))
        .filter((o): o is DiscordInteractionOption => o !== null),
      resolved: parseResolved(raw['resolved']),
    }),
  };
}

/**
 * Parse the `resolved` half of an interaction's data.
 */
function parseResolved(raw: unknown): { messages?: readonly DiscordInteractionMessage[] } | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const messages = readArray(raw, 'messages')
    ?.map((message) => parseResolvedMessage(message))
    .filter((m): m is DiscordInteractionMessage => m !== null);
  return messages === undefined ? undefined : { messages };
}

/**
 * Parse a message an interaction resolved.
 */
function parseResolvedMessage(raw: unknown): DiscordInteractionMessage | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  return {
    ...compact({
      id: readString(raw, 'id'),
      content: readString(raw, 'content'),
    }),
    ...compact({
      attachments: readArray(raw, 'attachments')
        ?.map((attachment) => parseAttachment(attachment))
        .filter((attachment): attachment is DiscordAttachment => attachment !== null),
    }),
  };
}

/**
 * Parse one command option.
 */
function parseOption(raw: unknown): DiscordInteractionOption | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  return compact({
    name: readString(raw, 'name'),
    type: readNumber(raw, 'type'),
    value: readString(raw, 'value'),
  });
}
