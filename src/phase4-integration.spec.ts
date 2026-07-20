import { Test } from '@nestjs/testing';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { AiModule } from './ai.module.js';
import { ProviderRegistry } from './core/provider-registry.js';
import { Agent } from './agent/agent.decorator.js';
import { AiAgent } from './agent/ai-agent.base.js';
import { UsageTracker } from './usage/usage-tracker.service.js';
import { BudgetExceededError } from './usage/budget.guardrail.js';
import { PiiRedactionGuardrail } from './safety/pii-redaction.guardrail.js';

@Agent({ model: 'gpt-4o', system: 'Assistant.' })
class BudgetAgent extends AiAgent {}

describe('phase 4 integration', () => {
  it('tracks cost, redacts PII, and enforces a per-conversation budget', async () => {
    const prompts: string[] = [];
    const model: LanguageModelV3 = new MockLanguageModelV3({
      modelId: 'gpt-4o',
      doGenerate: async (options: any) => {
        prompts.push(JSON.stringify(options.prompt));
        return {
          content: [{ type: 'text', text: 'ok' }],
          finishReason: 'stop',
          usage: {
            inputTokens: { total: 1_000_000 },
            outputTokens: { total: 0 },
          },
          warnings: [],
        };
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          providers: { openai: { apiKey: 'test' } },
          maxCostPerConversation: 1, // gpt-4o 1M input = $2.5 > $1
        }),
      ],
      providers: [BudgetAgent, PiiRedactionGuardrail],
    })
      .overrideProvider(ProviderRegistry)
      .useValue({
        getLanguageModel: () => model,
        getEmbeddingModel: () => {
          throw new Error('unused');
        },
      } as unknown as ProviderRegistry)
      .compile();
    await moduleRef.init();

    const agent = moduleRef.get(BudgetAgent);
    const usage = moduleRef.get(UsageTracker);

    // First run: succeeds, PII redacted in the prompt sent to the model.
    const result = await agent.run('email me at bob@example.com', {
      conversationId: 'c',
    });
    expect(result.text).toBe('ok');
    expect(prompts[0]).not.toContain('bob@example.com');
    expect(prompts[0]).toContain('[REDACTED]');
    expect(usage.totals('c').cost).toBeCloseTo(2.5);

    // Second run: blocked because the conversation is over budget.
    await expect(agent.run('again', { conversationId: 'c' })).rejects.toThrow(
      BudgetExceededError,
    );

    await moduleRef.close();
  });
});
