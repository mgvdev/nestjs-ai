import { MockEmbeddingModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { ProviderRegistry } from '../../core/provider-registry.js';
import { EmbeddingsService } from '../../embeddings/embeddings.service.js';
import { InMemoryVectorStore } from '../../rag/in-memory-vector-store.js';
import { SemanticMemory } from './semantic-memory.service.js';

function vec(text: string): number[] {
  const t = text.toLowerCase();
  return [t.includes('cat') ? 1 : 0, t.includes('dog') ? 1 : 0];
}

function makeMemory(): SemanticMemory {
  const model = new MockEmbeddingModelV3<string>({
    doEmbed: async ({ values }) => ({
      embeddings: values.map(vec),
      usage: { tokens: values.length },
    }),
  });
  const embeddings = new EmbeddingsService({
    getEmbeddingModel: () => model,
  } as unknown as ProviderRegistry);
  return new SemanticMemory(embeddings, new InMemoryVectorStore());
}

describe('SemanticMemory', () => {
  it('remembers and recalls the most relevant snippet', async () => {
    const memory = makeMemory();
    await memory.remember('conv1', 'the cat likes tuna');
    await memory.remember('conv1', 'the dog likes bones');

    const hits = await memory.recall('conv1', 'tell me about the cat');
    expect(hits[0].content).toContain('cat');
  });

  it('isolates memory per conversation', async () => {
    const memory = makeMemory();
    await memory.remember('conv1', 'cat fact');
    await memory.remember('conv2', 'cat fact for two');

    const hits = await memory.recall('conv2', 'cat');
    expect(hits).toHaveLength(1);
    expect(hits[0].content).toBe('cat fact for two');
  });
});
