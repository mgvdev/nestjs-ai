import type {
  VectorDocument,
  VectorQueryOptions,
  VectorQueryResult,
  VectorStore,
} from '../../vector-store.interface.js';

/** Structural subset of the Qdrant JS client we use. */
export interface QdrantClientLike {
  upsert(collection: string, params: unknown): Promise<unknown>;
  search(
    collection: string,
    params: unknown,
  ): Promise<Array<{ id: string | number; score: number; payload?: any }>>;
  delete(collection: string, params: unknown): Promise<unknown>;
}

export interface QdrantVectorStoreOptions {
  collection: string;
}

/**
 * `VectorStore` backed by Qdrant. Pass a `@qdrant/js-client-rest` `QdrantClient`
 * (or a compatible object). The payload stores `content` alongside metadata.
 */
export class QdrantVectorStore implements VectorStore {
  constructor(
    private readonly client: QdrantClientLike,
    private readonly options: QdrantVectorStoreOptions,
  ) {}

  async upsert(documents: VectorDocument[]): Promise<void> {
    await this.client.upsert(this.options.collection, {
      wait: true,
      points: documents.map((doc) => {
        if (!doc.embedding) {
          throw new Error(`Document "${doc.id}" has no embedding.`);
        }
        return {
          id: doc.id,
          vector: doc.embedding,
          payload: { content: doc.content, ...doc.metadata },
        };
      }),
    });
  }

  async query(
    embedding: number[],
    options: VectorQueryOptions = {},
  ): Promise<VectorQueryResult[]> {
    const results = await this.client.search(this.options.collection, {
      vector: embedding,
      limit: options.topK ?? 4,
      with_payload: true,
      filter: buildFilter(options.filter),
    });
    return results.map((hit) => {
      const { content, ...metadata } = hit.payload ?? {};
      return {
        id: String(hit.id),
        content: String(content ?? ''),
        score: hit.score,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      };
    });
  }

  async delete(ids: string[]): Promise<void> {
    await this.client.delete(this.options.collection, { points: ids });
  }

  async clear(): Promise<void> {
    await this.client.delete(this.options.collection, { filter: {} });
  }
}

function buildFilter(filter?: Record<string, unknown>) {
  if (!filter || Object.keys(filter).length === 0) {
    return undefined;
  }
  return {
    must: Object.entries(filter).map(([key, value]) => ({
      key,
      match: { value },
    })),
  };
}
