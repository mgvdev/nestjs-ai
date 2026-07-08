import { Inject, Injectable } from '@nestjs/common';
import { RATE_LIMITER } from '../ai.constants.js';
import { Guardrail } from '../observability/guardrail.decorator.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from '../observability/guardrail.interface.js';
import {
  RateLimitedError,
  type RateLimiter,
} from './rate-limiter.interface.js';

/**
 * Guardrail that throttles runs through the configured `RateLimiter`, keyed by
 * conversation id (or `"global"`). Registered when `rateLimiter` is set.
 */
@Guardrail()
@Injectable()
export class RateLimitGuardrail implements GuardrailContract {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  async beforeRun(ctx: GuardrailContext): Promise<void> {
    const key = ctx.options.conversationId ?? 'global';
    const allowed = await this.limiter.consume(key);
    if (!allowed) {
      throw new RateLimitedError(key);
    }
  }
}
