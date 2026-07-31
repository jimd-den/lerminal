/**
 * # Key-Value Store
 *
 * ## Business Value & Purpose
 * The narrowest possible seam over the device's key-value store. Repositories talk to
 * this instead of importing AsyncStorage directly, which buys two things: their failure
 * behaviour becomes testable without a device, and swapping AsyncStorage for SQLite,
 * encrypted storage, or a web backend touches exactly one file.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
