import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { BudgetPolicy } from './budget-policy.service.js';
import { AI_MODULE_OPTIONS, AGENT_METADATA } from '../ai.constants.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import type { AgentResult } from '../agent/agent.interface.js';
import { RunBudgetExceededError } from './run-budget-exceeded.error.js';
import {
  BUDGET_EXCEEDED_HANDLER,
  type BudgetExceededHandler,
  type OnBudgetExceeded,
} from './on-budget-exceeded.interface.js';

describe('BudgetPolicy', () => {
  async function build(
    options: any,
    handler?: BudgetExceededHandler,
  ): Promise<BudgetPolicy> {
    const providers: any[] = [
      BudgetPolicy,
      { provide: AI_MODULE_OPTIONS, useValue: options },
    ];
    if (handler) {
      providers.push({ provide: BUDGET_EXCEEDED_HANDLER, useValue: handler });
    }
    const moduleRef = await Test.createTestingModule({ providers }).compile();
    return moduleRef.get(BudgetPolicy);
  }

  function ctx(agentName: string, instance: object): GuardrailContext {
    return {
      agent: agentName,
      agentInstance: instance,
      messages: [],
      options: {},
    };
  }

  function result(usage: {
    inputTokens: number;
    outputTokens: number;
  }): AgentResult {
    return {
      text: '',
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
      },
      messages: [],
    };
  }

  function agentWithBudget(budget: any): object {
    class Agent {}
    Reflect.defineMetadata(
      AGENT_METADATA,
      { budget, model: 'gpt' },
      Agent,
    );
    return new Agent();
  }

  it('does nothing when no limits are configured', async () => {
    const policy = await build({});
    await expect(
      policy.enforceRunBudget(
        {},
        ctx('A', {}),
        result({ inputTokens: 1000, outputTokens: 1000 }),
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks when cost exceeds global limit', async () => {
    const policy = await build({
      budget: { maxCostPerRun: 0.001 },
      pricing: { gpt: { input: 1, output: 1 } },
    });
    await expect(
      policy.enforceRunBudget(
        {},
        {
          agent: 'A',
          agentInstance: {},
          messages: [],
          options: { model: 'gpt' },
        },
        result({ inputTokens: 2000, outputTokens: 0 }),
      ),
    ).rejects.toThrow(RunBudgetExceededError);
  });

  it('uses agent override over global limit', async () => {
    const instance = agentWithBudget({ maxCostPerRun: 1 });
    const policy = await build({
      budget: { maxCostPerRun: 0.001 },
      pricing: { gpt: { input: 1, output: 1 } },
    });
    await expect(
      policy.enforceRunBudget(
        instance,
        ctx('A', instance),
        result({ inputTokens: 1000, outputTokens: 0 }),
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks when total tokens exceed limit', async () => {
    const policy = await build({ budget: { maxTotalTokensPerRun: 5 } });
    await expect(
      policy.enforceRunBudget(
        {},
        ctx('A', {}),
        result({ inputTokens: 3, outputTokens: 3 }),
      ),
    ).rejects.toThrow(RunBudgetExceededError);
  });

  it('blocks when input tokens exceed limit', async () => {
    const policy = await build({ budget: { maxInputTokensPerRun: 5 } });
    await expect(
      policy.enforceRunBudget(
        {},
        ctx('A', {}),
        result({ inputTokens: 5, outputTokens: 0 }),
      ),
    ).rejects.toThrow(RunBudgetExceededError);
  });

  it('blocks when output tokens exceed limit', async () => {
    const policy = await build({ budget: { maxOutputTokensPerRun: 5 } });
    await expect(
      policy.enforceRunBudget(
        {},
        ctx('A', {}),
        result({ inputTokens: 0, outputTokens: 5 }),
      ),
    ).rejects.toThrow(RunBudgetExceededError);
  });

  it('calls agent callback and allows', async () => {
    class Agent implements OnBudgetExceeded {
      onBudgetExceeded = vi
        .fn()
        .mockResolvedValue({ action: 'allow' as const });
    }
    const instance = new Agent();
    const policy = await build({ budget: { maxTotalTokensPerRun: 1 } });
    await policy.enforceRunBudget(
      instance,
      ctx('A', instance),
      result({ inputTokens: 10, outputTokens: 10 }),
    );
    expect(instance.onBudgetExceeded).toHaveBeenCalled();
  });

  it('calls agent callback and blocks with custom reason', async () => {
    class Agent implements OnBudgetExceeded {
      onBudgetExceeded = vi
        .fn()
        .mockResolvedValue({ action: 'block' as const, reason: 'agent-blocked' });
    }
    const instance = new Agent();
    const policy = await build({ budget: { maxTotalTokensPerRun: 1 } });
    await expect(
      policy.enforceRunBudget(
        instance,
        ctx('A', instance),
        result({ inputTokens: 10, outputTokens: 10 }),
      ),
    ).rejects.toThrow('agent-blocked');
  });

  it('falls back to global handler when agent has no callback', async () => {
    const handler: BudgetExceededHandler = {
      handleBudgetExceeded: vi
        .fn()
        .mockResolvedValue({ action: 'block', reason: 'global' }),
    };
    const policy = await build({ budget: { maxTotalTokensPerRun: 1 } }, handler);
    await expect(
      policy.enforceRunBudget(
        {},
        ctx('A', {}),
        result({ inputTokens: 10, outputTokens: 10 }),
      ),
    ).rejects.toThrow('global');
    expect(handler.handleBudgetExceeded).toHaveBeenCalled();
  });

  it('only triggers once per run even if multiple limits are exceeded', async () => {
    const handler: BudgetExceededHandler = {
      handleBudgetExceeded: vi
        .fn()
        .mockResolvedValue({ action: 'block', reason: 'once' }),
    };
    const policy = await build(
      {
        budget: {
          maxCostPerRun: 0.001,
          maxTotalTokensPerRun: 1,
        },
        pricing: { gpt: { input: 1, output: 1 } },
      },
      handler,
    );
    await expect(
      policy.enforceRunBudget(
        {},
        ctx('A', {}),
        result({ inputTokens: 2000, outputTokens: 2000 }),
      ),
    ).rejects.toThrow('once');
    expect(handler.handleBudgetExceeded).toHaveBeenCalledTimes(1);
  });

  it('calls beforeRunBudget agent callback and respects allow', async () => {
    class Agent implements OnBudgetExceeded {
      beforeRunBudget = vi
        .fn()
        .mockResolvedValue({ action: 'allow' as const });
    }
    const instance = new Agent();
    const policy = await build({});
    await policy.beforeRunBudget(instance, ctx('A', instance));
    expect(instance.beforeRunBudget).toHaveBeenCalled();
  });

  it('blocks in beforeRunBudget when agent callback returns block', async () => {
    class Agent implements OnBudgetExceeded {
      beforeRunBudget = vi
        .fn()
        .mockResolvedValue({ action: 'block' as const, reason: 'no-credit' });
    }
    const instance = new Agent();
    const policy = await build({});
    await expect(
      policy.beforeRunBudget(instance, ctx('A', instance)),
    ).rejects.toThrow('no-credit');
  });

  it('falls back to global beforeRunBudget when agent does not implement it', async () => {
    const handler: BudgetExceededHandler = {
      handleBudgetExceeded: vi.fn(),
      beforeRunBudget: vi
        .fn()
        .mockResolvedValue({ action: 'block', reason: 'global' }),
    };
    const policy = await build({}, handler);
    await expect(
      policy.beforeRunBudget({}, ctx('A', {})),
    ).rejects.toThrow('global');
  });

  it('calls afterRunBudget on agent and global handler', async () => {
    let agentCalled = false;
    let globalCalled = false;

    class Agent implements OnBudgetExceeded {
      async afterRunBudget() {
        agentCalled = true;
      }
    }

    const handler: BudgetExceededHandler = {
      handleBudgetExceeded: vi.fn(),
      async afterRunBudget() {
        globalCalled = true;
      },
    };

    const instance = new Agent();
    const policy = await build(
      { pricing: { gpt: { input: 1, output: 1 } } },
      handler,
    );
    await policy.afterRunBudget(
      instance,
      {
        agent: 'A',
        agentInstance: instance,
        messages: [],
        options: { model: 'gpt' },
      },
      result({ inputTokens: 1000, outputTokens: 0 }),
    );

    expect(agentCalled).toBe(true);
    expect(globalCalled).toBe(true);
  });
});

