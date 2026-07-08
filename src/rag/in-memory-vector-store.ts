import { Injectable } from '@nestjs/common';
import { cosineSimilarity } from 'ai';
import type {
  VectorDocument,
  VectorQueryOptions,
  VectorQueryResult,
  VectorStore,
} from './vector-store.interface.js';

/**
 * In-process vector store ranking by cosine similarity. Suitable for
 * development, tests, and small datasets. Not persistent or shared across
 * processes — provide a durable `VectorStore` for production.
 */
@Injectable()
export class InMemoryVectorStore implements VectorStore {
  private readonly documents = new Map<string, VectorDocument>();

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      if (!doc.embedding) {
        throw new Error(
          `Document "${doc.id}" has no embedding. InMemoryVectorStore requires ` +
            `precomputed embeddings (use RagService.ingest).`,
        );
      }
      this.documents.set(doc.id, doc);
    }
  }

  async query(
    embedding: number[],
    options: VectorQueryOptions = {},
  ): Promise<VectorQueryResult[]> {
    const topK = options.topK ?? 4;
    const filter = options.filter;

    const scored: VectorQueryResult[] = [];
    for (const doc of this.documents.values()) {
      if (filter && !this.matchesFilter(doc, filter)) {
        continue;
      }
      scored.push({
        id: doc.id,
        content: doc.content,
        score: cosineSimilarity(embedding, doc.embedding!),
        metadata: doc.metadata,
      });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
    }
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }

  private matchesFilter(
    doc: VectorDocument,
    filter: Record<string, unknown>,
  ): boolean {
    return Object.entries(filter).every(
      ([key, value]) => doc.metadata?.[key] === value,
    );
  }
}
