#!/usr/bin/env tsx

/**
 * Materializes `wrangler.jsonc` and provisions what it refers to.
 *
 * The five ordered calls are `@rexezuge/tooling`'s, converged from this file and
 * the other repos' copies. The entrypoint stays so `pnpm run prepare-config` and
 * the deploy job keep naming a path of this repo's own, and it adds the two
 * facts the kit cannot derive: the template lives under `apps/bridge/`, and
 * the route namespace's binding-to-namespace map.
 *
 * `WRANGLER_TEMPLATE_PATH` is how the template path is supplied: this file
 * cannot set it itself, because the kit resolves its paths at import time,
 * before any code here runs. The `prepare-config` script in `package.json` sets
 * it alongside the invocation.
 */
import {
  applyTopLevelPatch,
  applyVarsPatch,
  ensureMinimumConfigVersion,
  prepareConfigFile,
} from '@rexezuge/tooling/src/scripts/wrangler-config/patches';
import { provisionWranglerResources } from '@rexezuge/tooling/src/scripts/wrangler-config/resources';

prepareConfigFile();
ensureMinimumConfigVersion();
applyTopLevelPatch();
applyVarsPatch();
provisionWranglerResources({ BRIDGE_ROUTES: 'discord-telegram-bridge-routes' });
console.log('Wrangler configuration is ready.');
