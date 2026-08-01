/**
 * # Persistence Failure Contract
 *
 * ## Business Value & Purpose
 * A local-first learning workspace has exactly one copy of the user's cards. The most
 * dangerous thing storage can do is *lie*: report an empty collection when the real
 * reason was a failed read, because the next save then writes that emptiness back over
 * recoverable data. These types make failure impossible to confuse with absence —
 * "no data" is an empty array, "could not tell" is a thrown {@link PersistenceError}.
 */

/** Which half of the round trip failed. */
export type PersistenceOperation = "read" | "write";

/** Storage could not complete the operation; the true state of the data is unknown. */
export class PersistenceError extends Error {
  constructor(
    readonly store: string,
    readonly operation: PersistenceOperation,
    readonly cause?: unknown,
  ) {
    super(`${store}: ${operation} failed${causeSuffix(cause)}`);
    this.name = "PersistenceError";
  }
}

/** The bytes were readable but are not the shape we stored — treat as damaged, never as empty. */
export class CorruptedDataError extends PersistenceError {
  constructor(store: string, cause?: unknown) {
    super(store, "read", cause);
    this.name = "CorruptedDataError";
  }
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}

function causeSuffix(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : cause ? String(cause) : "";
  return message ? ` (${message})` : "";
}
