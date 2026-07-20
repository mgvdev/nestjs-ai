import { Test } from '@nestjs/testing';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { AiModule } from '../../ai.module.js';
import { ProviderRegistry } from '../../core/provider-registry.js';
import { Agent } from '../agent.decorator.js';
import { AiAgent } from '../ai-agent.base.js';
import { AgentRegistry } from './agent-registry.js';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function textModel(text: string): LanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: USAGE,
      warnings: [],
    }),
  });
}

function sequenced(results: any[]): LanguageModelV3 {
  let i = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => results[Math.min(i++, results.length - 1)],
  });
}

@Agent({ model: 'm-sub', system: 'Researcher.' })
class ResearchAgent extends AiAgent {}

@Agent({ model: 'm-super', system: 'Supervisor.', tools: [ResearchAgent] })
class SupervisorAgent extends AiAgent {}

describe('multi-agent orchestration', () => {
  it('lets a supervisor delegate to a sub-agent as a tool', async () => {
    const subModel = textModel('RESEARCH: 42');
    const superModel = sequenced([
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 's1',
            toolName: 'ResearchAgent',
            input: JSON.stringify({ input: 'find the answer' }),
          },
        ],
        finishReason: 'tool-calls',
        usage: USAGE,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'Final answer: 42' }],
        finishReason: 'stop',
        usage: USAGE,
        warnings: [],
      },
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({ providers: { openai: { apiKey: 'test' } } }),
      ],
      providers: [ResearchAgent, SupervisorAgent],
    })
      .overrideProvider(ProviderRegistry)
      .useValue({
        getLanguageModel: (id: string) =>
          id === 'm-sub' ? subModel : superModel,
        getEmbeddingModel: () => {
          throw new Error('unused');
        },
      } as unknown as ProviderRegistry)
      .compile();
    await moduleRef.init();

    const registry = moduleRef.get(AgentRegistry);
    expect(
      registry
        .all()
        .map((a) => a.name)
        .sort(),
    ).toEqual(['ResearchAgent', 'SupervisorAgent']);

    const supervisor = moduleRef.get(SupervisorAgent);
    const result = await supervisor.run('Answer my question');

    expect(result.text).toBe('Final answer: 42');
    // sub-agent's model was invoked => delegation happened
    expect((subModel as MockLanguageModelV3).doGenerateCalls.length).toBe(1);
    await moduleRef.close();
  });
});
