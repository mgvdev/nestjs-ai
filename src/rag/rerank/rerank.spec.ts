import { MockRerankingModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { ProviderRegistry } from '../../core/provider-registry.js';
import type { VectorQueryResult } from '../vector-store.interface.js';
import { HeuristicReranker } from './heuristic-reranker.js';
import { ModelReranker } from './model-reranker.js';

const docs: VectorQueryResult[] = [
  { id: 'a', content: 'the sky is blue', score: 0.5 },
  { id: 'b', content: 'cats purr when happy', score: 0.6 },
  { id: 'c', content: 'happy cats love naps', score: 0.4 },
];

describe('HeuristicReranker', () => {
  it('boosts results that share query terms', async () => {
    const reranker = new HeuristicReranker({ overlapWeight: 1 });
    const out = await reranker.rerank('happy cats', docs, 2);
    // 'b' and 'c' both mention happy/cats; they should top the ranking.
    expect(out.map((r) => r.id).sort()).toEqual(['b', 'c']);
    expect(out).toHaveLength(2);
  });
});

describe('ModelReranker', () => {
  it('reorders results by the model ranking', async () => {
    const model = new MockRerankingModelV3({
      modelId: 'rerank-test',
      doRerank: async ({
        documents,
      }: {
        documents: { values: unknown[] };
      }) => ({
        // reverse order: last document is most relevant
        ranking: documents.values
          .map((_, i) => ({ index: i, relevanceScore: i }))
          .sort((a, b) => b.relevanceScore - a.relevanceScore),
        warnings: [],
      }),
    });
    const registry = {
      getRerankingModel: () => model,
    } as unknown as ProviderRegistry;

    const reranker = new ModelReranker(registry);
    const out = await reranker.rerank('q', docs, 3);
    expect(out.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(out[0].score).toBe(2);
  });

  it('returns empty for no results', async () => {
    const reranker = new ModelReranker({} as ProviderRegistry);
    expect(await reranker.rerank('q', [], 3)).toEqual([]);
  });
});
