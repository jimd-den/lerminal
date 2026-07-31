/**
 * # Logger Port
 *
 * ## Business Value & Purpose
 * Keeps logging *policy* out of infrastructure. Repositories used to narrate every
 * ordinary read to the console, which buried the rare line that actually mattered.
 * They now report through this port and the composition root decides what to do with
 * it — print in development, stay quiet in tests, ship somewhere in production.
 */
export interface Logger {
  debug(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, error?: unknown): void;
}

/** The default: says nothing. Tests and production get quiet unless told otherwise. */
export const silentLogger: Logger = {
  debug: () => {},
  warn: () => {},
  error: () => {},
};
