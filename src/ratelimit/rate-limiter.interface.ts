/**
 * Throttles agent runs. Implement this (e.g. Redis) for distributed limiting
 * and register it via `AiModule.forRoot({ rateLimiter })`.
 */
export interface RateLimiter {
  /**
   * Attempts to consume `cost` units for `key`. Resolves `true` if allowed,
   * `false` if the limit is exceeded.
   */
  consume(key: string, cost?: number): Promise<boolean>;
}

/** Thrown by the rate-limit guardrail when a run is throttled. */
export class RateLimitedError extends Error {
  constructor(public readonly key: string) {
    super(`Rate limit exceeded for "${key}".`);
    this.name = 'RateLimitedError';
  }
}
