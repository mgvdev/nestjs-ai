import { Injectable, type Provider, type Type } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { APICallError, type LanguageModelV3 } from '@ai-sdk/provider';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiModule } from '../ai.module.js';
import { CONVERSATION_STORE } from '../ai.constants.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import type { ConversationStore } from '../memory/conversation-store.interface.js';
import { AI_EVENTS } from '../observability/ai-events.js';
import { Guardrail } from '../observability/guardrail.decorator.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from '../observability/guardrail.interface.js';
import { Tool } from '../tools/tool.decorator.js';
import type { BudgetDecision } from '../usage/budget.types.js';
import type { OnBudgetExceeded } from '../usage/on-budget-exceeded.interface.js';
import { UsageTracker } from '../usage/usage-tracker.service.js';
import { Agent } from './agent.decorator.js';
import { AiAgent } from './ai-agent.base.js';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const STREAM_USAGE = {
  inputTokens: {
    total: USAGE.inputTokens,
    noCache: USAGE.inputTokens,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: USAGE.outputTokens,
    text: USAGE.outputTokens,
    reasoning: undefined,
  },
};

type GenResult = Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

/**
 * Builds a mock model that returns each result in order across successive
 * `doGenerate` calls. (The array form of `doGenerate` does not dispatch
 * sequentially, so we drive it with an explicit counter.)
 */
function sequencedModel(results: GenResult[]): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => results[Math.min(call++, results.length - 1)],
  });
}

/** A dependency injected into the tool provider to prove DI is preserved. */
@Injectable()
class WeatherApi {
  readonly calls: string[] = [];
  lookup(city: string): { city: string; tempC: number } {
    this.calls.push(city);
    return { city, tempC: 21 };
  }
}

@Injectable()
class WeatherTools {
  constructor(private readonly api: WeatherApi) {}

  @Tool({
    description: 'Get the current weather for a city',
    schema: z.object({ city: z.string() }),
  })
  getWeather({ city }: { city: string }) {
    return this.api.lookup(city);
  }
}

@Agent({
  model: 'openai:gpt-4o',
  system: 'You are a weather assistant.',
  tools: [WeatherTools],
})
class WeatherAgent extends AiAgent {}

@Agent({
  model: 'openai:gpt-4o',
  system: 'Classify sentiment.',
  output: z.object({ sentiment: z.enum(['positive', 'neutral', 'negative']) }),
})
class SentimentAgent extends AiAgent implements OnBudgetExceeded {
  after = 0;

  async afterRunBudget(): Promise<void> {
    this.after += 1;
  }
}

@Agent({ model: 'openai:gpt-4o' })
class StreamingBudgetAgent extends AiAgent implements OnBudgetExceeded {
  after = 0;

  async afterRunBudget(): Promise<void> {
    this.after += 1;
  }
}

@Agent({ model: 'openai:gpt-4o' })
class BlockingBudgetAgent extends AiAgent implements OnBudgetExceeded {
  async beforeRunBudget(): Promise<BudgetDecision> {
    return { action: 'block', reason: 'no-credits-left' };
  }
}

@Guardrail()
class RecordingGuardrail implements GuardrailContract {
  before = 0;
  after = 0;
  error?: Error;
  afterError?: Error;

  beforeRun(ctx: GuardrailContext): void {
    this.before += 1;
    if (this.error) {
      throw this.error;
    }
    ctx.messages.push({ role: 'system', content: 'Guardrail instruction' });
  }

  afterRun(): void {
    this.after += 1;
    if (this.afterError) {
      throw this.afterError;
    }
  }
}

/** Mutable holder so each test installs its own mock model. */
let currentModel: LanguageModelV3;

async function bootstrapWith({
  providers = [],
  guardrails = [],
}: {
  providers?: Provider[];
  guardrails?: Type<any>[];
} = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      AiModule.forRoot({
        providers: { openai: { apiKey: 'test' } },
        guardrails,
      }),
    ],
    providers: [
      WeatherApi,
      WeatherTools,
      WeatherAgent,
      SentimentAgent,
      StreamingBudgetAgent,
      ...providers,
    ],
  })
    .overrideProvider(ProviderRegistry)
    .useValue({
      getLanguageModel: () => currentModel,
      getEmbeddingModel: () => {
        throw new Error('not used');
      },
    } as unknown as ProviderRegistry)
    .compile();
  await moduleRef.init();
  return moduleRef;
}

function streamingModel(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: text },
        { type: 'text-end', id: '0' },
        { type: 'finish', finishReason: 'stop', usage: STREAM_USAGE },
      ]),
    },
  });
}

function failingStreamingModel(error: Error): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: 'Partial response' },
        { type: 'error', error },
      ]),
    },
  });
}

function retryingStreamingModel(): MockLanguageModelV3 {
  let attempts = 0;
  return new MockLanguageModelV3({
    doStream: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new APICallError({
          message: 'temporary stream failure',
          url: 'https://example.test',
          requestBodyValues: {},
          isRetryable: true,
        });
      }
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: '{"sentiment":"positive"}' },
          { type: 'text-end', id: '0' },
          { type: 'finish', finishReason: 'stop', usage: STREAM_USAGE },
        ]),
      };
    },
  });
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) {}
}

describe('AgentExecutorService (integration)', () => {
  it('runs a multi-step tool call, preserving DI in the tool', async () => {
    currentModel = sequencedModel([
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'getWeather',
            input: JSON.stringify({ city: 'Paris' }),
          },
        ],
        finishReason: 'tool-calls',
        usage: USAGE,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'It is 21°C in Paris.' }],
        finishReason: 'stop',
        usage: USAGE,
        warnings: [],
      },
    ]);

    const moduleRef = await bootstrapWith();
    const agent = moduleRef.get(WeatherAgent);
    const api = moduleRef.get(WeatherApi);

    const result = await agent.run('What is the weather in Paris?');

    expect(result.text).toContain('Paris');
    expect(api.calls).toEqual(['Paris']);
    await moduleRef.close();
  });

  it('produces structured output when the agent declares a schema', async () => {
    currentModel = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: 'text', text: JSON.stringify({ sentiment: 'positive' }) }],
        finishReason: 'stop',
        usage: USAGE,
        warnings: [],
      },
    });

    const moduleRef = await bootstrapWith();
    const agent = moduleRef.get(SentimentAgent);

    const result = await agent.run<{ sentiment: string }>('I love this!');

    expect(result.object).toEqual({ sentiment: 'positive' });
    await moduleRef.close();
  });

  it('persists and reloads conversation history', async () => {
    const reply = (text: string): GenResult => ({
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: USAGE,
      warnings: [],
    });
    currentModel = sequencedModel([reply('First reply.'), reply('Second reply.')]);

    const moduleRef = await bootstrapWith();
    const agent = moduleRef.get(WeatherAgent);
    const store = moduleRef.get<ConversationStore>(CONVERSATION_STORE);

    await agent.run('Hello', { conversationId: 'conv-1' });
    await agent.run('Are you there?', { conversationId: 'conv-1' });

    const history = await store.load('conv-1');
    const userTexts = history
      .filter((m) => m.role === 'user')
      .map((m) => m.content);
    expect(userTexts).toEqual(['Hello', 'Are you there?']);
    // second model call must have seen the prior turns
    const secondCall = (currentModel as MockLanguageModelV3).doGenerateCalls[1];
    expect(secondCall.prompt.length).toBeGreaterThan(1);
    await moduleRef.close();
  });

  it('streams text chunks', async () => {
    currentModel = streamingModel('Hello world');

    const moduleRef = await bootstrapWith();
    const agent = moduleRef.get(WeatherAgent);

    const result = await agent.stream('Hi');
    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    expect(text).toBe('Hello world');
    await moduleRef.close();
  });

  it('finalizes a consumed text stream like run()', async () => {
    currentModel = streamingModel('Hello world');
    const moduleRef = await bootstrapWith({
      guardrails: [RecordingGuardrail],
    });
    const agent = moduleRef.get(StreamingBudgetAgent);
    const usage = moduleRef.get(UsageTracker);
    const events: string[] = [];
    const emitter = moduleRef.get(EventEmitter2);
    emitter.on(AI_EVENTS.agentRunFinish, () => events.push('run'));
    emitter.on(AI_EVENTS.streamFinish, () => events.push('stream'));

    const result = await agent.stream('Hi', { conversationId: 'conv-1' });
    await drain(result.textStream);

    expect(usage.totals('conv-1').inputTokens).toBe(USAGE.inputTokens);
    expect(moduleRef.get(RecordingGuardrail)).toMatchObject({ before: 1, after: 1 });
    expect(moduleRef.get(StreamingBudgetAgent).after).toBe(1);
    expect(await moduleRef.get<ConversationStore>(CONVERSATION_STORE).load('conv-1'))
      .toHaveLength(2);
    expect(events).toEqual(['run', 'stream']);
    await moduleRef.close();
  });

  it('finalizes a consumed structured stream like run()', async () => {
    currentModel = streamingModel('{"sentiment":"positive"}');
    const moduleRef = await bootstrapWith({
      guardrails: [RecordingGuardrail],
    });
    const agent = moduleRef.get(SentimentAgent);
    const usage = moduleRef.get(UsageTracker);
    const store = moduleRef.get<ConversationStore>(CONVERSATION_STORE);

    const result = await agent.stream('I love this!', { conversationId: 'conv-1' });
    if (!('partialObjectStream' in result)) {
      throw new Error('Expected a structured stream result.');
    }
    await drain(result.partialObjectStream);

    expect(await store.load('conv-1')).toEqual([
      { role: 'user', content: 'I love this!' },
      { role: 'assistant', content: '{"sentiment":"positive"}' },
    ]);
    expect(usage.totals('conv-1').inputTokens).toBe(USAGE.inputTokens);
    expect(moduleRef.get(RecordingGuardrail).after).toBe(1);
    expect(moduleRef.get(SentimentAgent).after).toBe(1);
    await moduleRef.close();
  });

  it('reports one error for an invalid structured stream without success events', async () => {
    currentModel = streamingModel('{"sentiment":"unsupported"}');
    const moduleRef = await bootstrapWith();
    const agent = moduleRef.get(SentimentAgent);
    const emitter = moduleRef.get(EventEmitter2);
    let errors = 0;
    let successes = 0;
    emitter.on(AI_EVENTS.agentRunError, () => errors++);
    emitter.on(AI_EVENTS.agentRunFinish, () => successes++);
    emitter.on(AI_EVENTS.streamFinish, () => successes++);

    const result = await agent.stream('Classify this', { conversationId: 'conv-1' });
    if (!('partialObjectStream' in result)) {
      throw new Error('Expected a structured stream result.');
    }
    await drain(result.partialObjectStream);

    expect(errors).toBe(1);
    expect(successes).toBe(0);
    expect(await moduleRef.get<ConversationStore>(CONVERSATION_STORE).load('conv-1'))
      .toEqual([]);
    await moduleRef.close();
  });

  it('honors maxRetries for a structured stream', async () => {
    currentModel = retryingStreamingModel();
    const moduleRef = await bootstrapWith();
    const agent = moduleRef.get(SentimentAgent);

    const result = await agent.stream('Classify this', { maxRetries: 0 });
    if (!('partialObjectStream' in result)) {
      throw new Error('Expected a structured stream result.');
    }
    await drain(result.partialObjectStream);

    expect((currentModel as MockLanguageModelV3).doStreamCalls).toHaveLength(1);
    await moduleRef.close();
  });

  it('reports a stream error once without persisting a partial assistant response', async () => {
    currentModel = failingStreamingModel(new Error('stream failed'));
    const moduleRef = await bootstrapWith();
    const agent = moduleRef.get(WeatherAgent);
    const emitter = moduleRef.get(EventEmitter2);
    let errors = 0;
    let successes = 0;
    emitter.on(AI_EVENTS.agentRunError, () => errors++);
    emitter.on(AI_EVENTS.agentRunFinish, () => successes++);
    emitter.on(AI_EVENTS.streamFinish, () => successes++);

    const result = await agent.stream('Hi', { conversationId: 'conv-1' });
    await drain(result.fullStream);

    expect(errors).toBe(1);
    expect(successes).toBe(0);
    expect(await moduleRef.get<ConversationStore>(CONVERSATION_STORE).load('conv-1'))
      .toEqual([]);
    await moduleRef.close();
  });

  it('reports a post-run stream failure while the raw SDK stream completes', async () => {
    currentModel = streamingModel('Hello world');
    const moduleRef = await bootstrapWith({
      guardrails: [RecordingGuardrail],
    });
    const agent = moduleRef.get(WeatherAgent);
    const guardrail = moduleRef.get(RecordingGuardrail);
    guardrail.afterError = new Error('after-run failed');
    const emitter = moduleRef.get(EventEmitter2);
    let errors = 0;
    let successes = 0;
    emitter.on(AI_EVENTS.agentRunError, () => errors++);
    emitter.on(AI_EVENTS.agentRunFinish, () => successes++);
    emitter.on(AI_EVENTS.streamFinish, () => successes++);

    const result = await agent.stream('Hi', { conversationId: 'conv-1' });
    await expect(drain(result.fullStream)).resolves.toBeUndefined();

    expect(errors).toBe(1);
    expect(successes).toBe(0);
    const history = await moduleRef
      .get<ConversationStore>(CONVERSATION_STORE)
      .load('conv-1');
    expect(history).toHaveLength(2);
    expect(history).toEqual(
      expect.arrayContaining([
        { role: 'user', content: 'Hi' },
        expect.objectContaining({
          role: 'assistant',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: 'Hello world' }),
          ]),
        }),
      ]),
    );
    await moduleRef.close();
  });

  it('loads history and runs before hooks before opening a text stream', async () => {
    currentModel = streamingModel('ok');
    const moduleRef = await bootstrapWith({
      guardrails: [RecordingGuardrail],
    });
    const agent = moduleRef.get(WeatherAgent);
    const store = moduleRef.get<ConversationStore>(CONVERSATION_STORE);
    await store.append('conv-1', [{ role: 'user', content: 'Earlier turn' }]);

    const result = await agent.stream('Current turn', {
      conversationId: 'conv-1',
    });
    await drain(result.textStream);

    expect((currentModel as MockLanguageModelV3).doStreamCalls).toHaveLength(1);
    expect((currentModel as MockLanguageModelV3).doStreamCalls[0].prompt).toContainEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.arrayContaining([
          expect.objectContaining({ text: 'Earlier turn' }),
        ]),
      }),
    );
    expect((currentModel as MockLanguageModelV3).doStreamCalls[0].prompt).toContainEqual(
      expect.objectContaining({
        role: 'system',
        content: 'Guardrail instruction',
      }),
    );
    expect(moduleRef.get(RecordingGuardrail).before).toBe(1);
    await moduleRef.close();
  });

  it('rejects before opening a stream when a preflight hook blocks', async () => {
    currentModel = streamingModel('never reached');
    const moduleRef = await bootstrapWith({ providers: [BlockingBudgetAgent] });

    await expect(moduleRef.get(BlockingBudgetAgent).stream('blocked')).rejects.toThrow(
      'no-credits-left',
    );
    expect((currentModel as MockLanguageModelV3).doStreamCalls).toHaveLength(0);
    await moduleRef.close();
  });
});
