import { describe, expect, it } from 'vitest';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import { bareModelId, costOf, DEFAULT_PRICING } from './pricing.js';
import { UsageTracker } from './usage-tracker.service.js';
import { BudgetExceededError, BudgetGuard } from './budget.guardrail.js';

describe('pricing', () => {
  it('strips provider prefix', () => {
    expect(bareModelId('openai:gpt-4o')).toBe('gpt-4o');
    expect(bareModelId('gpt-4o')).toBe('gpt-4o');
  });

  it('computes cost from tokens', () => {
    const cost = costOf({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'gpt-4o');
    expect(cost).toBeCloseTo(DEFAULT_PRICING['gpt-4o'].input + DEFAULT_PRICING['gpt-4o'].output);
  });

  it('returns 0 for an unknown model', () => {
    expect(costOf({ inputTokens: 100 }, 'mystery-model')).toBe(0);
  });
});

function tracker(options: AiModuleOptions = {}): UsageTracker {
  return new UsageTracker(options);
}

describe('UsageTracker', () => {
  it('accumulates per conversation and globally', () => {
    const t = tracker();
    t.record({
      model: 'openai:gpt-4o',
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
      conversationId: 'c1',
    });
    t.record({
      model: 'openai:gpt-4o',
      usage: { inputTokens: 1_000_000, outputTokens: 0 },
      conversationId: 'c1',
    });
    expect(t.totals('c1').inputTokens).toBe(2_000_000);
    expect(t.totals('c1').runs).toBe(2);
    expect(t.totals('c1').cost).toBeCloseTo(2 * DEFAULT_PRICING['gpt-4o'].input);
    expect(t.totals().runs).toBe(2); // global
  });

  it('resets a conversation', () => {
    const t = tracker();
    t.record({ model: 'gpt-4o', usage: { inputTokens: 10 }, conversationId: 'c' });
    t.reset('c');
    expect(t.totals('c').runs).toBe(0);
  });
});

describe('BudgetGuard', () => {
  const options: AiModuleOptions = { maxCostPerConversation: 5 };

  function ctx(conversationId?: string): GuardrailContext {
    return { agent: 'A', agentInstance: {}, messages: [], options: { conversationId } };
  }

  it('allows runs under budget', () => {
    const t = tracker(options);
    const guard = new BudgetGuard(t, options);
    expect(() => guard.beforeRun(ctx('c'))).not.toThrow();
  });

  it('blocks once the budget is reached', () => {
    const t = tracker(options);
    // 1M in + 1M out of gpt-4o = 2.5 + 10 = 12.5 > 5
    t.record({
      model: 'gpt-4o',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      conversationId: 'c',
    });
    const guard = new BudgetGuard(t, options);
    expect(() => guard.beforeRun(ctx('c'))).toThrow(BudgetExceededError);
  });

  it('is a no-op without a configured limit', () => {
    const t = tracker();
    const guard = new BudgetGuard(t, {});
    expect(() => guard.beforeRun(ctx('c'))).not.toThrow();
  });
});
