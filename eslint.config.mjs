/**
 * The repo lint config, assembled from the kit factory plus this repo's deltas.
 *
 * `defineRepoLintConfig` (from `@rexezuge/tooling`) owns the plugin set, the
 * family's layered boundary table and the dynamic-`import()` guard generated
 * from that table. The deltas below are the two layers this repo's layout adds
 * to it: `bridge-core` is its zero-dependency base, and the worker app must not
 * reach itself by package name.
 */
import { defineRepoLintConfig } from '@rexezuge/tooling/eslint';

export default defineRepoLintConfig({
  scope: '@discord-telegram-bridge',
  tsconfigRootDir: import.meta.dirname,
  extraLayers: [
    {
      dir: 'packages/bridge-core',
      ban: ['@discord-telegram-bridge/*'],
      message: 'bridge-core must not import from other @discord-telegram-bridge packages — it is a zero-dependency base layer',
    },
    {
      dir: 'apps/bridge',
      ban: ['@discord-telegram-bridge/bridge'],
      message: 'apps/bridge must not self-import via package name; import its own source relatively',
    },
  ],
});
