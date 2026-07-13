import type {
  BudgetCheckContext,
  BudgetDecision,
  BudgetExceededContext,
  BudgetRunContext,
} from './budget.types.js';

export interface OnBudgetExceeded {
  /**
   * Called before the run. Use it to enforce dynamic limits (e.g. credits
   * stored in a database). Return block to abort the call, allow to proceed,
   * or void to defer to the global handler.
   */
  beforeRunBudget?(
    ctx: BudgetCheckContext,
  ):
    | BudgetDecision
    | Promise<BudgetDecision>
    | void
    | Promise<void>;

  /**
   * Called after the run with the actual cost and usage. Use it to deduct
   * credits or log spending.
   */
  afterRunBudget?(ctx: BudgetRunContext): void | Promise<void>;

  /**
   * Called when a configured static run limit is exceeded. Return a decision
   * to allow, block, or replace the result.
   */
  onBudgetExceeded?(
    ctx: BudgetExceededContext,
  ): BudgetDecision | Promise<BudgetDecision>;
}

export interface BudgetExceededHandler {
  beforeRunBudget?(
    ctx: BudgetCheckContext,
  ):
    | BudgetDecision
    | Promise<BudgetDecision>
    | void
    | Promise<void>;

  afterRunBudget?(ctx: BudgetRunContext): void | Promise<void>;

  handleBudgetExceeded(
    ctx: BudgetExceededContext,
  ): BudgetDecision | Promise<BudgetDecision>;
}

export const BUDGET_EXCEEDED_HANDLER = Symbol('BUDGET_EXCEEDED_HANDLER');
