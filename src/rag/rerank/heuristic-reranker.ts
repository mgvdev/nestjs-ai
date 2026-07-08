import { Injectable, Optional } from '@nestjs/common';
import type { VectorQueryResult } from '../vector-store.interface.js';
import type { Reranker } from './reranker.interface.js';

export interface HeuristicRerankerOptions {
  /** Weight of the query-term overlap boost relative to the base score. */
  overlapWeight?: number;
}

/**
 * Zero-dependency reranker that boosts results whose content shares terms with
 * the query, on top of the base similarity score. A pragmatic default when no
 * reranking model is configured.
 */
@Injectable()
export class HeuristicReranker implements Reranker {
  constructor(
    @Optional() private readonly options: HeuristicRerankerOptions = {},
  ) {}

  async rerank(
    query: string,
    results: VectorQueryResult[],
    topN: number,
  ): Promise<VectorQueryResult[]> {
    const weight = this.options.overlapWeight ?? 0.5;
    const terms = tokenize(query);

    return results
      .map((result) => ({
        result,
        score: result.score + weight * overlap(terms, result.content),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(({ result, score }) => ({ ...result, score }));
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

/** Fraction of query terms present in the content. */
function overlap(terms: Set<string>, content: string): number {
  if (terms.size === 0) {
    return 0;
  }
  const contentTerms = tokenize(content);
  let hits = 0;
  for (const term of terms) {
    if (contentTerms.has(term)) {
      hits++;
    }
  }
  return hits / terms.size;
}
