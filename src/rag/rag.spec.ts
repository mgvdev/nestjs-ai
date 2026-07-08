import { MockEmbeddingModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { ProviderRegistry } from '../core/provider-registry.js';
import { EmbeddingsService } from '../embeddings/embeddings.service.js';
import { InMemoryVectorStore } from './in-memory-vector-store.js';
import { RagService, splitText } from './rag.service.js';
import { createRetrievalTool } from './retrieval-tool.js';

/** Deterministic 2-D embedding: [has "cat", has "dog"]. */
function vec(text: string): number[] {
  const t = text.toLowerCase();
  return [t.includes('cat') ? 1 : 0, t.includes('dog') ? 1 : 0];
}

function makeRag(): { rag: RagService; store: InMemoryVectorStore } {
  const model = new MockEmbeddingModelV3<string>({
    doEmbed: async ({ values }) => ({
      embeddings: values.map(vec),
      usage: { tokens: values.length },
    }),
  });
  const embeddings = new EmbeddingsService({
    getEmbeddingModel: () => model,
  } as unknown as ProviderRegistry);
  const store = new InMemoryVectorStore();
  return { rag: new RagService(embeddings, store), store };
}

describe('splitText', () => {
  it('returns a single chunk when under the size', () => {
    expect(splitText('hello', 100, 10)).toEqual(['hello']);
  });

  it('splits with overlap', () => {
    const chunks = splitText('abcdefghij', 4, 1);
    expect(chunks[0]).toBe('abcd');
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('InMemoryVectorStore', () => {
  it('ranks by cosine similarity', async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { id: 'a', content: 'cat', embedding: [1, 0] },
      { id: 'b', content: 'dog', embedding: [0, 1] },
    ]);
    const results = await store.query([1, 0], { topK: 2 });
    expect(results[0].id).toBe('a');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('applies a metadata filter', async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { id: 'a', content: 'cat', embedding: [1, 0], metadata: { lang: 'en' } },
      { id: 'b', content: 'chat', embedding: [1, 0], metadata: { lang: 'fr' } },
    ]);
    const results = await store.query([1, 0], { filter: { lang: 'fr' } });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('b');
  });
});

describe('RagService', () => {
  it('ingests and retrieves the most relevant chunk', async () => {
    const { rag } = makeRag();
    await rag.ingest([
      { id: 'cat', content: 'The cat sat on the mat.' },
      { id: 'dog', content: 'The dog ran in the park.' },
    ]);
    const results = await rag.retrieve('tell me about the cat');
    expect(results[0].content).toContain('cat');
  });

  it('applies a reranker when requested', async () => {
    const { rag } = makeRag();
    await rag.ingest([
      { id: 'cat', content: 'The cat sat on the mat.' },
      { id: 'cat2', content: 'A cat naps in the sun.' },
    ]);
    // Reranker that reverses the store order, proving it was applied.
    const reranker = {
      rerank: async (_q: string, results: any[], topN: number) =>
        [...results].reverse().slice(0, topN),
    };
    const normal = await rag.retrieve('cat', { topK: 2 });
    const reranked = await rag.retrieve('cat', { topK: 2, rerank: reranker });
    expect(reranked.map((r) => r.id)).toEqual(
      [...normal.map((r) => r.id)].reverse(),
    );
  });

  it('exposes a retrieval tool that formats hits', async () => {
    const { rag } = makeRag();
    await rag.ingest([{ id: 'cat', content: 'Cats purr when happy.' }]);
    const retrieval = createRetrievalTool(rag, { topK: 1 });
    const output = await retrieval.execute!(
      { query: 'cat facts' },
      {} as any,
    );
    expect(output).toContain('Cats purr');
  });
});
