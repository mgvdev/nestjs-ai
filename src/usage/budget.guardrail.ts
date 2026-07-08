import { Inject, Injectable } from '@nestjs/common';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import { Guardrail } from '../observability/guardrail.decorator.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from '../observability/guardrail.interface.js';
import { UsageTracker } from './usage-tracker.service.js';

/** Thrown when a conversation exceeds its configured cost budget. */
export class BudgetExceededError extends Error {
  constructor(
    public readonly conversationId: string | undefined,
    public readonly spent: number,
    public readonly limit: number,
  ) {
    super(
      `Budget exceeded${conversationId ? ` for "${conversationId}"` : ''}: ` +
        `$${spent.toFixed(4)} >= $${limit.toFixed(4)}.`,
    );
    this.name = 'BudgetExceededError';
  }
}

/**
 * Guardrail that blocks a run when the conversation's accumulated cost has
 * reached `maxCostPerConversation`. Registered automatically when that option
 * is set.
 */
@Guardrail()
@Injectable()
export class BudgetGuard implements GuardrailContract {
  constructor(
    private readonly usage: UsageTracker,
    @Inject(AI_MODULE_OPTIONS) private readonly options: AiModuleOptions,
  ) {}

  beforeRun(ctx: GuardrailContext): void {
    const limit = this.options.maxCostPerConversation;
    if (limit == null) {
      return;
    }
    const { cost } = this.usage.totals(ctx.options.conversationId);
    if (cost >= limit) {
      throw new BudgetExceededError(ctx.options.conversationId, cost, limit);
    }
  }
}
