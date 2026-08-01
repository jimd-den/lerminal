import { Logger } from "../../usecases/ports/Logger";

declare const __DEV__: boolean | undefined;

const format = (event: string, context?: Record<string, unknown>): string =>
  context && Object.keys(context).length > 0
    ? `${event} ${JSON.stringify(context)}`
    : event;

/**
 * # Console Logger
 *
 * ## Business Value & Purpose
 * The single place that decides logging is allowed to be noisy. `debug` is dropped
 * outside development, so a shipped build reports problems and nothing else; the
 * per-read chatter that used to live in every repository is gated here instead.
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly verbose: boolean = __DEV__ === true) {}

  debug(event: string, context?: Record<string, unknown>): void {
    if (!this.verbose) return;
    console.log(`[debug] ${format(event, context)}`);
  }

  warn(event: string, context?: Record<string, unknown>): void {
    console.warn(`[warn] ${format(event, context)}`);
  }

  error(event: string, error?: unknown): void {
    console.error(`[error] ${event}`, error);
  }
}
