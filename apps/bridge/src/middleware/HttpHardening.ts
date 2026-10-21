import { rateLimit, securityHeaders, sensitivePaths } from '@rexezuge/http';
import { EnvParser } from '@rexezuge/runtime';

/**
 * The request hardening every route goes through.
 *
 * Two concerns, both of them things a public endpoint needs and a loopback
 * one does not: the security headers every response carries, and a rate limit
 * so a single caller cannot spend the Worker's subrequest budget on Telegram
 * API calls.
 */

/**
 * How many requests one address may make per minute, unless configured
 * otherwise.
 *
 * A bridged channel can be busy, and a webhook post is one request per
 * message — so the ceiling is generous by design. It exists to stop a
 * runaway client, not to police normal use.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;

/**
 * The rate limit budget for one request.
 */
export function rateLimitBudget(env: unknown): number {
  return EnvParser.nonNegativeInt(env, 'RATE_LIMIT_PER_MINUTE', String(DEFAULT_RATE_LIMIT_PER_MINUTE));
}

/**
 * The middleware stack, in the order it runs.
 */
export const HttpHardening = [
  securityHeaders(sensitivePaths('/admin')),
  rateLimit({
    windowMs: 60_000,
    max: (c) => rateLimitBudget(c.env),
    keyPrefix: 'bridge',
  }),
];
