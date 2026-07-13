import { Injectable } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AiModule } from './ai.module.js';
import { ProviderRegistry } from './core/provider-registry.js';
import { Agent } from './agent/agent.decorator.js';
import { AiAgent } from './agent/ai-agent.base.js';
import { Tool } from './tools/tool.decorator.js';
import { RagService } from './rag/rag.service.js';
import { Guardrail } from './observability/guardrail.decorator.js';
import type { Guardrail as GuardrailContract } from './observability/guardrail.interface.js';
import { GuardrailRegistry } from './observability/guardrail.registry.js';
import { AI_EVENTS } from './observability/ai-events.js';
import { RunBudgetExceededError } from './usage/run-budget-exceeded.error.js';
import type { OnBudgetExceeded } from './usage/on-budget-exceeded.interface.js';
import type { BudgetDecision, BudgetExceededContext } from './usage/budget.types.js';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Deterministic 2-D embedding: [has "cat", has "dog"]. */
function vec(text: string): number[] {
  const t = text.toLowerCase();
  return [t.includes('cat') ? 1 : 0, t.includes('dog') ? 1 : 0];
}

@Injectable()
class KbTools {
  lastResult = '';
  constructor(private readonly rag: RagService) {}

  @Tool({
    description: 'Search the knowledge base',
    schema: z.object({ query: z.string() }),
  })
  async search({ query }: { query: string }) {
    const hits = await this.rag.retrieve(query);
    this.lastResult = hits.map((h) => h.content).join('; ');
    return this.lastResult;
  }
}

@Agent({ model: 'openai:gpt-4o', system: 'KB assistant.', tools: [KbTools] })
class KbAgent extends AiAgent {}

@Guardrail()
class RunCounter implements GuardrailContract {
  before = 0;
  after = 0;
  beforeRun() {
    this.before++;
  }
  afterRun() {
    this.after++;
  }
}

describe('run budget integration', () => {
  it('registers RunBudgetGuardrail when budget is configured', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        AiModule.forRoot({
          providers: { openai: { apiKey: 'test' } },
          budget: { maxTotalTokensPerRun: 1 },
        }),
      ],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(GuardrailRegistry);
    expect(registry.count).toBe(1);
    await moduleRef.close();
  });

  it('invokes run budget guardrail through registry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        AiModule.forRoot({
          providers: { openai: { apiKey: 'test' } },
          budget: { maxTotalTokensPerRun: 1 },
        }),
      ],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(GuardrailRegistry);
    await expect(
      registry.runAfterRun(
        {
          agent: 'A',
          agentInstance: {},
          messages: [],
          options: {},
        },
        {
          text: '',
          usage: {
            inputTokens: 5,
            outputTokens: 5,
            totalTokens: 10,
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
        },
      ),
    ).rejects.toThrow(RunBudgetExceededError);
    await moduleRef.close();
  });

  it('blocks a run via beforeRunBudget agent hook', async () => {
    const langModel = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'should not run' }],
        finishReason: 'stop',
        usage: USAGE,
        warnings: [],
      }),
    }) as LanguageModelV3;

    @Agent({ model: 'openai:gpt-4o' })
    class PreCheckAgent extends AiAgent implements OnBudgetExceeded {
      async beforeRunBudget(): Promise<BudgetDecision> {
        return { action: 'block', reason: 'no-credits-left' };
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        AiModule.forRoot({ providers: { openai: { apiKey: 'test' } } }),
      ],
      providers: [PreCheckAgent],
    })
      .overrideProvider(ProviderRegistry)
      .useValue({
        getLanguageModel: () => langModel,
      } as unknown as ProviderRegistry)
      .compile();
    await moduleRef.init();

    const agent = moduleRef.get(PreCheckAgent);
    await expect(agent.run('hello')).rejects.toThrow('no-credits-left');
    await moduleRef.close();
  });
});

describe('phase 2 integration', () => {
  it('runs an agent that retrieves from RAG, firing guardrails and events', async () => {
    let step = 0;
    const langModel = new MockLanguageModelV3({
      doGenerate: async () =>
        step++ === 0
          ? {
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 't1',
                  toolName: 'search',
                  input: JSON.stringify({ query: 'cat' }),
                },
              ],
              finishReason: 'tool-calls',
              usage: USAGE,
              warnings: [],
            }
          : {
              content: [{ type: 'text', text: 'Cats purr when content.' }],
              finishReason: 'stop',
              usage: USAGE,
              warnings: [],
            },
    }) as LanguageModelV3;

    const embedModel = new MockEmbeddingModelV3<string>({
      doEmbed: async ({ values }) => ({
        embeddings: values.map(vec),
        usage: { tokens: values.length },
      }),
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        AiModule.forRoot({ providers: { openai: { apiKey: 'test' } } }),
      ],
      providers: [KbTools, KbAgent, RunCounter],
    })
      .overrideProvider(ProviderRegistry)
      .useValue({
        getLanguageModel: () => langModel,
        getEmbeddingModel: () => embedModel,
      } as unknown as ProviderRegistry)
      .compile();
    await moduleRef.init();

    // Seed the knowledge base.
    const rag = moduleRef.get(RagService);
    await rag.ingest([
      { id: 'cat', content: 'Cats purr and love naps.' },
      { id: 'dog', content: 'Dogs bark and fetch balls.' },
    ]);

    // Listen for the finish event.
    const emitter = moduleRef.get(EventEmitter2);
    let finished = false;
    emitter.on(AI_EVENTS.agentRunFinish, () => {
      finished = true;
    });

    const agent = moduleRef.get(KbAgent);
    const counter = moduleRef.get(RunCounter);
    const tools = moduleRef.get(KbTools);

    const result = await agent.run('Tell me about cats');

    expect(result.text).toContain('purr');
    expect(tools.lastResult).toContain('Cats purr'); // retrieval tool ran
    expect(counter.before).toBe(1); // guardrail beforeRun fired
    expect(counter.after).toBe(1); // guardrail afterRun fired
    expect(finished).toBe(true); // finish event emitted
    await moduleRef.close();
  });
});
