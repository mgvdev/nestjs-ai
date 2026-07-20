import { Inject, Injectable, Optional } from '@nestjs/common';
import { RERANKER, VECTOR_STORE } from '../ai.constants.js';
import { EmbeddingsService } from '../embeddings/embeddings.service.js';
import type {
  VectorDocument,
  VectorQueryResult,
  VectorStore,
} from './vector-store.interface.js';
import type { Reranker } from './rerank/reranker.interface.js';

/** An item to ingest into the vector store. */
export interface IngestItem {
  /** Base id; chunks are suffixed `#0`, `#1`, … Defaults to a positional id. */
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IngestOptions {
  /** Max characters per chunk (default 1000; 0 disables chunking). */
  chunkSize?: number;
  /** Character overlap between consecutive chunks (default 100). */
  chunkOverlap?: number;
  /** Embedding model id. */
  model?: string;
}

export interface RetrieveOptions {
  topK?: number;
  model?: string;
  filter?: Record<string, unknown>;
  /**
   * Rerank the results before truncating to `topK`. `true` uses the configured
   * default reranker; pass a `Reranker` to override. When reranking, more
   * candidates (`fetchK`) are fetched first.
   */
  rerank?: boolean | Reranker;
  /** Candidates to fetch before reranking (default `topK * 4`). */
  fetchK?: number;
}

/**
 * Retrieval-augmented generation helper: chunk + embed + store documents, and
 * embed queries to fetch the most relevant chunks.
 */
@Injectable()
export class RagService {
  constructor(
    private readonly embeddings: EmbeddingsService,
    @Inject(VECTOR_STORE) private readonly store: VectorStore,
    @Optional() @Inject(RERANKER) private readonly defaultReranker?: Reranker,
  ) {}

  /** Chunks, embeds, and upserts items into the vector store. */
  async ingest(
    items: IngestItem[],
    options: IngestOptions = {},
  ): Promise<void> {
    const chunkSize = options.chunkSize ?? 1000;
    const overlap = options.chunkOverlap ?? 100;

    const chunks: {
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }[] = [];
    items.forEach((item, index) => {
      const baseId = item.id ?? `doc-${index}`;
      splitText(item.content, chunkSize, overlap).forEach(
        (text, chunkIndex) => {
          chunks.push({
            id: `${baseId}#${chunkIndex}`,
            content: text,
            metadata: item.metadata,
          });
        },
      );
    });

    if (chunks.length === 0) {
      return;
    }

    const { embeddings } = await this.embeddings.embedMany(
      chunks.map((c) => c.content),
      { model: options.model },
    );

    const documents: VectorDocument[] = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: embeddings[i],
    }));
    await this.store.upsert(documents);
  }

  /** Embeds `query` and returns the most similar stored chunks. */
  async retrieve(
    query: string,
    options: RetrieveOptions = {},
  ): Promise<VectorQueryResult[]> {
    const { embedding } = await this.embeddings.embed(query, {
      model: options.model,
    });
    const topK = options.topK ?? 4;

    const reranker =
      options.rerank === true
        ? this.defaultReranker
        : options.rerank || undefined;

    const fetchK = reranker ? (options.fetchK ?? topK * 4) : topK;
    const results = await this.store.query(embedding, {
      topK: fetchK,
      filter: options.filter,
    });

    if (reranker) {
      return reranker.rerank(query, results, topK);
    }
    return results.slice(0, topK);
  }
}

/** Splits text into overlapping fixed-size character chunks. */
export function splitText(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  if (chunkSize <= 0 || text.length <= chunkSize) {
    return text.length > 0 ? [text] : [];
  }
  const step = Math.max(1, chunkSize - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + chunkSize));
    if (start + chunkSize >= text.length) {
      break;
    }
  }
  return chunks;
}
