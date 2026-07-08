import type { VectorQueryResult } from '../vector-store.interface.js';

/**
 * Re-orders retrieval results by relevance to the query, returning the top `topN`.
 */
export interface Reranker {
  rerank(
    query: string,
    results: VectorQueryResult[],
    topN: number,
  ): Promise<VectorQueryResult[]>;
}
