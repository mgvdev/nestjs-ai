import { Inject, Injectable } from '@nestjs/common';
import { VECTOR_STORE } from '../ai.constants.js';
import { EmbeddingsService } from '../embeddings/embeddings.service.js';
import type {
  VectorDocument,
  VectorQueryResult,
  VectorStore,
} from './vector-store.interface.js';

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
  ) {}

  /** Chunks, embeds, and upserts items into the vector store. */
  async ingest(items: IngestItem[], options: IngestOptions = {}): Promise<void> {
    const chunkSize = options.chunkSize ?? 1000;
    const overlap = options.chunkOverlap ?? 100;

    const chunks: { id: string; content: string; metadata?: Record<string, unknown> }[] =
      [];
    items.forEach((item, index) => {
      const baseId = item.id ?? `doc-${index}`;
      splitText(item.content, chunkSize, overlap).forEach((text, chunkIndex) => {
        chunks.push({
          id: `${baseId}#${chunkIndex}`,
          content: text,
          metadata: item.metadata,
        });
      });
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
    return this.store.query(embedding, {
      topK: options.topK,
      filter: options.filter,
    });
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
