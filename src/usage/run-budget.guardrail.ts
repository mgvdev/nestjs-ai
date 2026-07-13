import { Injectable } from '@nestjs/common';
import { Guardrail } from '../observability/guardrail.decorator.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from '../observability/guardrail.interface.js';
import type { AgentResult } from '../agent/agent.interface.js';
import { BudgetPolicy } from './budget-policy.service.js';

@Guardrail()
@Injectable()
export class RunBudgetGuardrail implements GuardrailContract {
  constructor(private readonly policy: BudgetPolicy) {}

  async afterRun(
    ctx: GuardrailContext,
    result: AgentResult,
  ): Promise<void> {
    await this.policy.enforceRunBudget(ctx.agentInstance, ctx, result);
  }
}
