import { Inject, Injectable, Optional } from '@nestjs/common';
import { AGENT_METADATA, AI_MODULE_OPTIONS } from '../ai.constants.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import type { AgentResult } from '../agent/agent.interface.js';
import { costOf } from './pricing.js';
import type {
  BudgetCheckContext,
  BudgetDecision,
  BudgetExceededContext,
  BudgetExceededKind,
  BudgetLimits,
  BudgetRunContext,
} from './budget.types.js';
import {
  BUDGET_EXCEEDED_HANDLER,
  type BudgetExceededHandler,
  type OnBudgetExceeded,
} from './on-budget-exceeded.interface.js';
import { RunBudgetExceededError } from './run-budget-exceeded.error.js';

function isOnBudgetExceeded(value: unknown): value is OnBudgetExceeded {
  return (
    typeof value === 'object' &&
    value !== null &&
    (typeof (value as OnBudgetExceeded).onBudgetExceeded === 'function' ||
      typeof (value as OnBudgetExceeded).beforeRunBudget === 'function' ||
      typeof (value as OnBudgetExceeded).afterRunBudget === 'function')
  );
}

function emptyUsage(): NonNullable<AgentResult['usage']> {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
  };
}

@Injectable()
export class BudgetPolicy {
  constructor(
    @Inject(AI_MODULE_OPTIONS) private readonly options: AiModuleOptions,
    @Optional()
    @Inject(BUDGET_EXCEEDED_HANDLER)
    private readonly globalHandler?: BudgetExceededHandler,
  ) {}

  async beforeRunBudget(
    agentInstance: object,
    ctx: GuardrailContext,
  ): Promise<void> {
    const checkCtx: BudgetCheckContext = {
      agent: ctx.agent,
      model: this.resolveModel(ctx, agentInstance),
      conversationId: ctx.options.conversationId,
      messages: ctx.messages,
      options: ctx.options,
    };

    const decision = await this.resolveBeforeRunDecision(
      agentInstance,
      checkCtx,
    );
    if (decision?.action === 'block') {
      throw new RunBudgetExceededError(
        {
          agent: ctx.agent,
          conversationId: ctx.options.conversationId,
          exceeded: 'cost',
          limit: 0,
          cost: 0,
        },
        decision.reason,
      );
    }
  }

  async afterRunBudget(
    agentInstance: object,
    ctx: GuardrailContext,
    result: AgentResult,
  ): Promise<void> {
    const model = this.resolveModel(ctx, agentInstance);
    const cost = costOf(result.usage ?? {}, model, this.options.pricing);
    const runCtx: BudgetRunContext = {
      agent: ctx.agent,
      model,
      conversationId: ctx.options.conversationId,
      usage: result.usage ?? emptyUsage(),
      cost,
      result,
    };

    if (isOnBudgetExceeded(agentInstance)) {
      await agentInstance.afterRunBudget?.(runCtx);
    }
    await this.globalHandler?.afterRunBudget?.(runCtx);
  }

  async enforceRunBudget(
    agentInstance: object,
    ctx: GuardrailContext,
    result: AgentResult,
  ): Promise<void> {
    const limits = this.resolveLimits(agentInstance);
    const model = this.resolveModel(ctx, agentInstance);
    const cost = costOf(result.usage ?? {}, model, this.options.pricing);

    const exceeded = this.findExceededLimit(limits, result.usage ?? {}, cost);
    if (!exceeded) {
      return;
    }

    const budgetCtx: BudgetExceededContext = {
      agent: ctx.agent,
      model,
      conversationId: ctx.options.conversationId,
      usage: result.usage ?? emptyUsage(),
      cost,
      exceeded: exceeded.kind,
      limit: exceeded.limit,
      result,
    };

    const decision = this.resolveExceededDecision(agentInstance, budgetCtx);
    return this.applyDecision(decision, budgetCtx);
  }

  private resolveLimits(agentInstance: object): BudgetLimits {
    const agentOptions = Reflect.getMetadata(
      AGENT_METADATA,
      agentInstance.constructor,
    );
    const agentLimits: BudgetLimits | undefined = agentOptions?.budget;
    return {
      ...this.options.budget,
      ...agentLimits,
    };
  }

  private resolveModel(
    ctx: GuardrailContext,
    agentInstance: object,
  ): string {
    const agentOptions = Reflect.getMetadata(
      AGENT_METADATA,
      agentInstance.constructor,
    );
    const agentModel: string | string[] | undefined = agentOptions?.model;
    return (
      (Array.isArray(ctx.options.model)
        ? ctx.options.model[0]
        : ctx.options.model) ??
      (Array.isArray(agentModel) ? agentModel[0] : agentModel) ??
      'unknown'
    );
  }

  private findExceededLimit(
    limits: BudgetLimits,
    usage: { inputTokens?: number; outputTokens?: number },
    cost: number,
  ): { kind: BudgetExceededKind; limit: number } | undefined {
    if (limits.maxCostPerRun != null && cost >= limits.maxCostPerRun) {
      return { kind: 'cost', limit: limits.maxCostPerRun };
    }

    const input = usage.inputTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    const total = input + output;

    if (
      limits.maxInputTokensPerRun != null &&
      input >= limits.maxInputTokensPerRun
    ) {
      return { kind: 'inputTokens', limit: limits.maxInputTokensPerRun };
    }

    if (
      limits.maxOutputTokensPerRun != null &&
      output >= limits.maxOutputTokensPerRun
    ) {
      return { kind: 'outputTokens', limit: limits.maxOutputTokensPerRun };
    }

    if (
      limits.maxTotalTokensPerRun != null &&
      total >= limits.maxTotalTokensPerRun
    ) {
      return { kind: 'totalTokens', limit: limits.maxTotalTokensPerRun };
    }

    return undefined;
  }

  private async resolveBeforeRunDecision(
    agentInstance: object,
    ctx: BudgetCheckContext,
  ): Promise<BudgetDecision | undefined> {
    if (isOnBudgetExceeded(agentInstance)) {
      const decision = await agentInstance.beforeRunBudget?.(ctx);
      if (this.isDecision(decision)) {
        return decision;
      }
    }
    if (this.globalHandler?.beforeRunBudget) {
      const decision = await this.globalHandler.beforeRunBudget(ctx);
      if (this.isDecision(decision)) {
        return decision;
      }
    }
    return undefined;
  }

  private isDecision(
    value: BudgetDecision | void | Promise<BudgetDecision | void>,
  ): value is BudgetDecision | Promise<BudgetDecision> {
    return value != null && typeof value === 'object' && 'action' in value;
  }

  private resolveExceededDecision(
    agentInstance: object,
    ctx: BudgetExceededContext,
  ): BudgetDecision | Promise<BudgetDecision> {
    if (isOnBudgetExceeded(agentInstance)) {
      const decision = agentInstance.onBudgetExceeded?.(ctx);
      if (decision) {
        return decision;
      }
    }
    if (this.globalHandler) {
      return this.globalHandler.handleBudgetExceeded(ctx);
    }
    return { action: 'block' };
  }

  private async applyDecision(
    decision: BudgetDecision | Promise<BudgetDecision>,
    ctx: BudgetExceededContext,
  ): Promise<void> {
    const resolved = await decision;
    if (resolved.action === 'allow') {
      return;
    }
    throw new RunBudgetExceededError(ctx, resolved.reason);
  }
}
