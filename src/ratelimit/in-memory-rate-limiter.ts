import type { RateLimiter } from './rate-limiter.interface.js';

export interface InMemoryRateLimiterOptions {
  /** Maximum tokens in the bucket (burst size). */
  capacity: number;
  /** Tokens added per `intervalMs`. */
  refillTokens: number;
  /** Refill interval in milliseconds. */
  intervalMs: number;
  /** Clock, for testing. Defaults to `Date.now`. */
  now?: () => number;
}

interface Bucket {
  tokens: number;
  last: number;
}

/**
 * In-process token-bucket rate limiter, keyed (e.g. by conversation or user).
 * Not shared across processes — provide a distributed `RateLimiter` for scale.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly options: InMemoryRateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  async consume(key: string, cost = 1): Promise<boolean> {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? {
      tokens: this.options.capacity,
      last: now,
    };

    const elapsed = now - bucket.last;
    if (elapsed > 0) {
      const refill =
        (elapsed / this.options.intervalMs) * this.options.refillTokens;
      bucket.tokens = Math.min(this.options.capacity, bucket.tokens + refill);
      bucket.last = now;
    }

    let allowed = false;
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      allowed = true;
    }
    this.buckets.set(key, bucket);
    return allowed;
  }
}
