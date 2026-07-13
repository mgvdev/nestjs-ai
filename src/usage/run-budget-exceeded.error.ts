import type { BudgetExceededContext } from './budget.types.js';
import { BudgetExceededError } from './budget.guardrail.js';

export class RunBudgetExceededError extends BudgetExceededError {
  constructor(
    public readonly ctx: Pick<
      BudgetExceededContext,
      'agent' | 'conversationId' | 'exceeded' | 'limit' | 'cost'
    >,
    reason?: string,
  ) {
    super(ctx.conversationId, ctx.cost, ctx.limit);
    this.name = 'RunBudgetExceededError';
    this.message =
      reason ??
      `Run budget exceeded for agent "${ctx.agent}"` +
        `${ctx.conversationId ? ` in conversation "${ctx.conversationId}"` : ''}: ` +
        `${ctx.exceeded}=${ctx.cost.toFixed(6)} >= ${ctx.limit}.`;
  }
}
