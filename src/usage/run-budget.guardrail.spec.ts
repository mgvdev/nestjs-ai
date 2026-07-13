import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { RunBudgetGuardrail } from './run-budget.guardrail.js';
import { BudgetPolicy } from './budget-policy.service.js';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import type { AgentResult } from '../agent/agent.interface.js';

describe('RunBudgetGuardrail', () => {
  it('delegates to BudgetPolicy', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RunBudgetGuardrail,
        BudgetPolicy,
        { provide: AI_MODULE_OPTIONS, useValue: {} },
      ],
    }).compile();
    const guardrail = moduleRef.get(RunBudgetGuardrail);
    const policy = moduleRef.get(BudgetPolicy);
    const spy = vi.spyOn(policy, 'enforceRunBudget').mockResolvedValue();

    const instance = {};
    const ctx: GuardrailContext = {
      agent: 'A',
      agentInstance: instance,
      messages: [],
      options: {},
    };
    const result: AgentResult = { text: '', messages: [] };

    await guardrail.afterRun(ctx, result);
    expect(spy).toHaveBeenCalledWith(instance, ctx, result);
  });
});
