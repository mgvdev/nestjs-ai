import { MockEmbeddingModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { ProviderRegistry } from '../core/provider-registry.js';
import { EmbeddingsService } from './embeddings.service.js';

function makeService(): EmbeddingsService {
  const model = new MockEmbeddingModelV3<string>({
    modelId: 'text-embedding-3-small',
    doEmbed: async ({ values }) => ({
      embeddings: values.map((v) => [v.charCodeAt(0)]),
      usage: { tokens: values.length },
    }),
  });
  const registry = {
    getEmbeddingModel: () => model,
  } as unknown as ProviderRegistry;
  return new EmbeddingsService(registry);
}

describe('EmbeddingsService', () => {
  it('embeds a single value', async () => {
    const service = makeService();
    const { embedding } = await service.embed('hello');
    expect(embedding).toEqual(['h'.charCodeAt(0)]);
  });

  it('embeds many values', async () => {
    const service = makeService();
    const { embeddings } = await service.embedMany(['a', 'b']);
    expect(embeddings).toHaveLength(2);
    expect(embeddings).toContainEqual(['a'.charCodeAt(0)]);
    expect(embeddings).toContainEqual(['b'.charCodeAt(0)]);
  });
});
