import { fileURLToPath } from 'node:url';
import { defineUnitVitestConfig } from '@rexezuge/tooling/vitest';

/**
 * The unit suite: resolver and coverage floors.
 *
 * The alias table, the `cloudflare:*` mocks and the inlining that keeps
 * `@rexezuge/*` inside Vite's pipeline all come from the kit factory, derived
 * from `scope` and this repo's package list. Two entries stay local:
 * `bridge` is aliased by hand because the factory only knows `apps/background`
 * as an app it can reach by name, and the coverage floors are this repo's own
 * measurement.
 */
export default defineUnitVitestConfig({
  scope: '@discord-telegram-bridge',
  packages: ['bridge-core'],
  aliases: [
    {
      find: '@discord-telegram-bridge/bridge',
      replacement: fileURLToPath(new URL('apps/bridge/src', import.meta.url)),
    },
  ],
  root: new URL('.', import.meta.url).href,
  coverageInclude: ['apps/bridge/src/**/*.ts', 'packages/**/src/**/*.ts'],
  /**
   * The floors are a first measurement to be ratcheted up, not a number picked
   * in advance: the response to a drop is a test, not a lowered number.
   */
  thresholds: {
    statements: 92,
    branches: 81,
    functions: 94,
    lines: 92,
  },
});
