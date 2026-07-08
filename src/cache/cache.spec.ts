import { generateText, wrapLanguageModel } from 'ai';
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderRegistry } from '../core/provider-registry.js';
import { EmbeddingsService } from '../embeddings/embeddings.service.js';
import { InMemoryAiCache } from './in-memory-ai-cache.js';
import { createCacheMiddleware } from './cache-middleware.js';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

describe('cache middleware', () => {
  it('serves a second identical call from cache (model called once)', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'cached answer' }],
      finishReason: 'stop' as const,
      usage: USAGE,
      warnings: [],
    }));
    const model = wrapLanguageModel({
      model: new MockLanguageModelV3({ doGenerate }),
      middleware: createCacheMiddleware(new InMemoryAiCache()),
    });

    const a = await generateText({ model, prompt: 'same question' });
    const b = await generateText({ model, prompt: 'same question' });

    expect(a.text).toBe('cached answer');
    expect(b.text).toBe('cached answer');
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not share cache across different prompts', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'x' }],
      finishReason: 'stop' as const,
      usage: USAGE,
      warnings: [],
    }));
    const model = wrapLanguageModel({
      model: new MockLanguageModelV3({ doGenerate }),
      middleware: createCacheMiddleware(new InMemoryAiCache()),
    });

    await generateText({ model, prompt: 'q1' });
    await generateText({ model, prompt: 'q2' });
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });
});

describe('InMemoryAiCache', () => {
  it('expires entries after ttl', async () => {
    const cache = new InMemoryAiCache();
    await cache.set('k', 'v', -1); // already expired
    expect(await cache.get('k')).toBeUndefined();
    await cache.set('k2', 'v2');
    expect(await cache.get('k2')).toBe('v2');
  });
});

describe('EmbeddingsService caching', () => {
  it('caches single embeddings', async () => {
    const doEmbed = vi.fn(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2]),
      usage: { tokens: values.length },
    }));
    const model = new MockEmbeddingModelV3<string>({
      modelId: 'text-embedding-3-small',
      doEmbed,
    });
    const service = new EmbeddingsService(
      { getEmbeddingModel: () => model } as unknown as ProviderRegistry,
      new InMemoryAiCache(),
    );

    const first = await service.embed('hello');
    const second = await service.embed('hello');
    expect(first.embedding).toEqual([0.1, 0.2]);
    expect(second.embedding).toEqual([0.1, 0.2]);
    expect(doEmbed).toHaveBeenCalledTimes(1);
  });
});
