import { describe, expect, it } from 'vitest';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import { InMemoryRateLimiter } from './in-memory-rate-limiter.js';
import { RateLimitGuardrail } from './rate-limit.guardrail.js';
import { RateLimitedError } from './rate-limiter.interface.js';

describe('InMemoryRateLimiter', () => {
  it('allows up to capacity then denies', async () => {
    let t = 0;
    const limiter = new InMemoryRateLimiter({
      capacity: 2,
      refillTokens: 1,
      intervalMs: 1000,
      now: () => t,
    });
    expect(await limiter.consume('k')).toBe(true);
    expect(await limiter.consume('k')).toBe(true);
    expect(await limiter.consume('k')).toBe(false);
  });

  it('refills over time', async () => {
    let t = 0;
    const limiter = new InMemoryRateLimiter({
      capacity: 1,
      refillTokens: 1,
      intervalMs: 1000,
      now: () => t,
    });
    expect(await limiter.consume('k')).toBe(true);
    expect(await limiter.consume('k')).toBe(false);
    t = 1000; // one interval later -> +1 token
    expect(await limiter.consume('k')).toBe(true);
  });

  it('keys are independent', async () => {
    const limiter = new InMemoryRateLimiter({
      capacity: 1,
      refillTokens: 1,
      intervalMs: 1000,
      now: () => 0,
    });
    expect(await limiter.consume('a')).toBe(true);
    expect(await limiter.consume('b')).toBe(true);
  });
});

describe('RateLimitGuardrail', () => {
  const ctx = (conversationId?: string): GuardrailContext => ({
    agent: 'A',
    messages: [],
    options: { conversationId },
  });

  it('throws when the limiter denies', async () => {
    const limiter = new InMemoryRateLimiter({
      capacity: 1,
      refillTokens: 0,
      intervalMs: 1000,
      now: () => 0,
    });
    const guard = new RateLimitGuardrail(limiter);
    await guard.beforeRun(ctx('c'));
    await expect(guard.beforeRun(ctx('c'))).rejects.toThrow(RateLimitedError);
  });
});
