import { ErrorSanitizationUtil } from '@rexezuge/shared';
import { AbstractEntrypointWorker } from '@rexezuge/runtime';
import type { WorkerExecutionContext } from '@rexezuge/runtime';
import type { ExecutionContext } from 'hono';
import { createBridgeApp } from './routes';

/**
 * The Worker's entrypoint.
 *
 * The base class catches anything that escapes the application and answers a
 * 500; the application itself handles its own errors, so what reaches the
 * base is a genuine defect rather than a rejected request.
 */
class BridgeWorker extends AbstractEntrypointWorker {
  private readonly app = createBridgeApp();

  protected async onRequest(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    return this.app.fetch(request, env, toHonoExecutionContext(ctx));
  }

  protected onScheduled(): Promise<void> {
    // This worker declares no cron triggers; the platform never dispatches here.
    return Promise.resolve();
  }

  /**
   * Log an escaped error.
   *
   * The message is a fixed string and the error goes through the kit's
   * redactor: a message from an upstream service can carry a token, and a
   * log line is a place a token ends up forever.
   */
  protected reportUnhandled(message: string, error: unknown): void {
    console.error(message, ErrorSanitizationUtil.sanitizeErrorForLogging(error));
  }
}

export { BridgeWorker };

/**
 * Adapt the kit's execution context to the one Hono declares.
 *
 * Hono's type carries a `props` field the platform's context does not have;
 * the bridge has no use for it, so it is supplied empty rather than the
 * platform context being cast into a shape it does not have.
 */
function toHonoExecutionContext(ctx: WorkerExecutionContext): ExecutionContext {
  return {
    waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
    passThroughOnException: () => ctx.passThroughOnException(),
    props: {},
  };
}
