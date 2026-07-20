import { Test } from '@nestjs/testing';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { AiModule } from '../ai.module.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import { Agent } from '../agent/agent.decorator.js';
import { AiAgent } from '../agent/ai-agent.base.js';
import { AgentJobProcessor } from './agent-job.processor.js';
import { AgentQueueService } from './agent-queue.service.js';
import { AGENT_QUEUE } from '../ai.constants.js';
import type { QueueLike } from './agent-job.types.js';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

@Agent({ model: 'm', system: 'Worker.' })
class WorkerAgent extends AiAgent {}

describe('AgentJobProcessor', () => {
  it('runs a queued job by resolving the agent from the registry', async () => {
    const model: LanguageModelV3 = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'job done' }],
        finishReason: 'stop',
        usage: USAGE,
        warnings: [],
      }),
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AiModule.forRoot({ providers: { openai: { apiKey: 't' } } })],
      providers: [WorkerAgent, AgentJobProcessor],
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

    const processor = moduleRef.get(AgentJobProcessor);
    const result = await processor.run({
      agent: 'WorkerAgent',
      input: 'do the thing',
    });
    expect(result.text).toBe('job done');
    await moduleRef.close();
  });

  it('throws for an unknown agent', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AiModule.forRoot({ providers: { openai: { apiKey: 't' } } })],
      providers: [AgentJobProcessor],
    }).compile();
    await moduleRef.init();

    const processor = moduleRef.get(AgentJobProcessor);
    await expect(processor.run({ agent: 'Nope', input: 'x' })).rejects.toThrow(
      /unknown agent/,
    );
    await moduleRef.close();
  });
});

describe('AgentQueueService', () => {
  it('enqueues a job and returns its id', async () => {
    const add = vi.fn(async () => ({ id: 'job-1' }));
    const queue: QueueLike = { add };
    const service = new AgentQueueService(queue);

    const id = await service.enqueue({ agent: 'WorkerAgent', input: 'hi' });
    expect(id).toBe('job-1');
    expect(add).toHaveBeenCalledWith(
      'agent-run',
      { agent: 'WorkerAgent', input: 'hi' },
      undefined,
    );
  });
});
