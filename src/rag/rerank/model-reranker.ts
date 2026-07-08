import { Injectable } from '@nestjs/common';
import { rerank } from 'ai';
import { ProviderRegistry } from '../../core/provider-registry.js';
import type { VectorQueryResult } from '../vector-store.interface.js';
import type { Reranker } from './reranker.interface.js';

/**
 * Reranker backed by a provider reranking model via the AI SDK's `rerank()`.
 * Requires a rerank-capable provider (e.g. `@ai-sdk/cohere`) configured through
 * `rerankingModel`.
 */
@Injectable()
export class ModelReranker implements Reranker {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly model?: string,
  ) {}

  async rerank(
    query: string,
    results: VectorQueryResult[],
    topN: number,
  ): Promise<VectorQueryResult[]> {
    if (results.length === 0) {
      return [];
    }
    const { ranking } = await rerank({
      model: this.providers.getRerankingModel(this.model),
      query,
      documents: results.map((r) => r.content),
      topN,
    });
    return ranking.map((entry) => ({
      ...results[entry.originalIndex],
      score: entry.score,
    }));
  }
}
