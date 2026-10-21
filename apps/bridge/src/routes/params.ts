import { BadRequestError } from '@rexezuge/errors';
import type { BridgeContext } from '../types';

/**
 * Read a path parameter that the route requires.
 *
 * Hono's typed `param()` answers `string | undefined` for a key the
 * application does not declare in its generic, and a missing parameter on a
 * route that names one is a malformed request rather than a missing route — so
 * it is refused here, where the reason can be named, rather than silently
 * becoming an empty string that matches everything.
 */
export function requireParam(c: BridgeContext, name: string): string {
  const value = c.req.param(name);
  if (value === undefined || value.length === 0) {
    throw new BadRequestError(`The "${name}" path parameter is required.`);
  }
  return value;
}
