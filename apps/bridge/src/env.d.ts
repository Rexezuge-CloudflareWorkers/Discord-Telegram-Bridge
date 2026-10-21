/**
 * The bindings this worker reads.
 *
 * The generated `worker-configuration.d.ts` carries the platform's runtime
 * types and the bindings the wrangler template declares; this file carries the
 * ones the template cannot — the secrets, which are set with
 * `wrangler secret put` and are therefore invisible to `wrangler types`.
 *
 * A secret is typed `string` rather than `string | undefined` because a
 * deployment that is missing one is a misconfiguration, not a variant: the
 * application layer reports it as a 500 with a message that names the binding,
 * which is a better answer than an `undefined` that surfaces three frames away.
 */

declare global {
  interface Env {
    /**
     * The Telegram Bot API token, from BotFather.
     */
    TELEGRAM_BOT_TOKEN: string;
    /**
     * The Telegram chat that receives messages no route maps.
     *
     * Empty means "no default": a message from an unmapped Discord source is
     * refused rather than delivered somewhere arbitrary.
     */
    TELEGRAM_CHAT_ID: string;
    /**
     * The Discord application's public key, hex-encoded.
     *
     * Used to verify the signature on every interaction request.
     */
    DISCORD_PUBLIC_KEY: string;
    /**
     * The shared secret expected in the webhook path.
     */
    DISCORD_WEBHOOK_TOKEN: string;
    /**
     * The KV namespace holding the Discord-to-Telegram route table.
     */
    BRIDGE_ROUTES: KVNamespace;
    /**
     * The Cloudflare Access team domain, e.g.
     * `https://example.cloudflareaccess.com`. Empty disables the admin API.
     */
    CF_ACCESS_TEAM_DOMAIN?: string;
    /**
     * The Cloudflare Access application audience tag. Empty disables the admin
     * API.
     */
    CF_ACCESS_AUD?: string;
    /**
     * A free-form environment marker, e.g. `production`.
     */
    ENVIRONMENT?: string;
    /**
     * How many requests one address may make per minute.
     */
    RATE_LIMIT_PER_MINUTE?: string;
  }
}

export {};
