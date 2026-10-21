import { vi } from 'vitest';

/**
 * The fixtures the application-level suites share.
 *
 * The environment is a plain object rather than a mock of the platform's
 * `Env`: the bridge reads a handful of strings and one KV namespace, and a
 * fake that implements exactly those is a smaller thing to keep honest than a
 * mock of the whole surface.
 */

/**
 * The webhook token the fixtures configure.
 */
export const TEST_WEBHOOK_TOKEN = 'webhook-secret';

/**
 * The default Telegram chat the fixtures configure.
 */
export const TEST_TELEGRAM_CHAT_ID = '-1001234567890';

/**
 * A KV namespace that holds what it is given.
 */
export class FakeKVNamespace {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null>;
  async get(keys: string[]): Promise<Map<string, string | null>>;
  async get(keyOrKeys: string | string[]): Promise<string | null | Map<string, string | null>> {
    if (Array.isArray(keyOrKeys)) {
      const result = new Map<string, string | null>();
      for (const key of keyOrKeys) {
        result.set(key, this.store.get(key) ?? null);
      }
      return result;
    }
    return this.store.get(keyOrKeys) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean }> {
    const prefix = options?.prefix ?? '';
    const keys = [...this.store.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

/**
 * The bindings the fixtures configure.
 */
export interface TestEnvOptions {
  readonly telegramChatId?: string;
  readonly publicKey?: string;
  readonly accessTeamDomain?: string;
  readonly accessAud?: string;
  readonly routes?: FakeKVNamespace;
}

/**
 * Build an environment for a suite.
 */
export function createTestEnv(options: TestEnvOptions = {}): Env {
  const env = {
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
    TELEGRAM_CHAT_ID: options.telegramChatId ?? TEST_TELEGRAM_CHAT_ID,
    DISCORD_PUBLIC_KEY: options.publicKey ?? '00'.repeat(32),
    DISCORD_WEBHOOK_TOKEN: TEST_WEBHOOK_TOKEN,
    BRIDGE_ROUTES: options.routes ?? new FakeKVNamespace(),
    ENVIRONMENT: 'test',
  } as unknown as Env;
  if (options.accessTeamDomain !== undefined) {
    Object.assign(env, { CF_ACCESS_TEAM_DOMAIN: options.accessTeamDomain });
  }
  if (options.accessAud !== undefined) {
    Object.assign(env, { CF_ACCESS_AUD: options.accessAud });
  }
  return env;
}

/**
 * A recorded Telegram API call.
 */
export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

/**
 * Install a `fetch` that answers the Telegram API and records what it was
 * asked.
 *
 * @param responder - Answers a call, or `undefined` for the default success.
 */
export function stubTelegramFetch(responder?: (call: RecordedCall) => Response | undefined): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rawBody = typeof init?.body === 'string' ? init.body : null;
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      body: rawBody === null ? init?.body : (JSON.parse(rawBody) as unknown),
    };
    calls.push(call);
    const response = responder?.(call);
    if (response !== undefined) {
      return response;
    }
    return Response.json(
      { ok: true, result: { message_id: 1 } },
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });
  return calls;
}

/**
 * Build a JSON response the way the Telegram API answers a failure.
 */
export function telegramFailure(status: number, description: string): Response {
  return Response.json(
    { ok: false, error_code: status, description },
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
