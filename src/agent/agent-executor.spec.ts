import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiModule } from '../ai.module.js';
import { CONVERSATION_STORE } from '../ai.constants.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import type { ConversationStore } from '../memory/conversation-store.interface.js';
import { Tool } from '../tools/tool.decorator.js';
import { Agent } from './agent.decorator.js';
import { AiAgent } from './ai-agent.base.js';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

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
class SentimentAgent extends AiAgent {}

/** Mutable holder so each test installs its own mock model. */
let currentModel: LanguageModelV3;

async function bootstrap() {
  const moduleRef = await Test.createTestingModule({
    imports: [AiModule.forRoot({ providers: { openai: { apiKey: 'test' } } })],
    providers: [WeatherApi, WeatherTools, WeatherAgent, SentimentAgent],
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

    const moduleRef = await bootstrap();
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

    const moduleRef = await bootstrap();
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

    const moduleRef = await bootstrap();
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
    currentModel = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: 'Hello' },
          { type: 'text-delta', id: '0', delta: ' world' },
          { type: 'text-end', id: '0' },
          { type: 'finish', finishReason: 'stop', usage: USAGE },
        ]),
      },
    });

    const moduleRef = await bootstrap();
    const agent = moduleRef.get(WeatherAgent);

    const result = agent.stream('Hi');
    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    expect(text).toBe('Hello world');
    await moduleRef.close();
  });
});
