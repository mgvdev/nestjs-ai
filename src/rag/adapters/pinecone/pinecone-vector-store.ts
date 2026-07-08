import type {
  VectorDocument,
  VectorQueryOptions,
  VectorQueryResult,
  VectorStore,
} from '../../vector-store.interface.js';

/** Structural subset of a Pinecone index (namespace) we use. */
export interface PineconeIndexLike {
  upsert(
    vectors: Array<{ id: string; values: number[]; metadata?: any }>,
  ): Promise<unknown>;
  query(params: {
    vector: number[];
    topK: number;
    includeMetadata?: boolean;
    filter?: Record<string, unknown>;
  }): Promise<{ matches?: Array<{ id: string; score?: number; metadata?: any }> }>;
  deleteMany(ids: string[]): Promise<unknown>;
  deleteAll(): Promise<unknown>;
}

/**
 * `VectorStore` backed by Pinecone. Pass a Pinecone index (optionally scoped to
 * a namespace): `pinecone.index('name').namespace('ns')`. `content` is stored in
 * the vector metadata.
 */
export class PineconeVectorStore implements VectorStore {
  constructor(private readonly index: PineconeIndexLike) {}

  async upsert(documents: VectorDocument[]): Promise<void> {
    await this.index.upsert(
      documents.map((doc) => {
        if (!doc.embedding) {
          throw new Error(`Document "${doc.id}" has no embedding.`);
        }
        return {
          id: doc.id,
          values: doc.embedding,
          metadata: { content: doc.content, ...doc.metadata },
        };
      }),
    );
  }

  async query(
    embedding: number[],
    options: VectorQueryOptions = {},
  ): Promise<VectorQueryResult[]> {
    const { matches } = await this.index.query({
      vector: embedding,
      topK: options.topK ?? 4,
      includeMetadata: true,
      filter: options.filter,
    });
    return (matches ?? []).map((match) => {
      const { content, ...metadata } = match.metadata ?? {};
      return {
        id: match.id,
        content: String(content ?? ''),
        score: match.score ?? 0,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      };
    });
  }

  async delete(ids: string[]): Promise<void> {
    await this.index.deleteMany(ids);
  }

  async clear(): Promise<void> {
    await this.index.deleteAll();
  }
}
