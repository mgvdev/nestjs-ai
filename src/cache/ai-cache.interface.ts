/**
 * Pluggable cache for language-model responses and embeddings. Implement this
 * (e.g. Redis) and register it via `AiModule.forRoot({ cache })`.
 */
export interface AiCache {
  /** Returns the cached value, or `undefined` on a miss / expiry. */
  get(key: string): Promise<unknown | undefined>;
  /** Stores a value with an optional time-to-live in milliseconds. */
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
}
