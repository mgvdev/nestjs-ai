/** A document stored in a vector store. */
export interface VectorDocument {
  id: string;
  content: string;
  /** Precomputed embedding. Required by stores that don't embed themselves. */
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

/** A single similarity-search hit. */
export interface VectorQueryResult {
  id: string;
  content: string;
  /** Similarity score (higher is closer). */
  score: number;
  metadata?: Record<string, unknown>;
}

/** Options for a vector similarity query. */
export interface VectorQueryOptions {
  /** Maximum number of results to return (default 4). */
  topK?: number;
  /** Optional metadata equality filter. */
  filter?: Record<string, unknown>;
}

/**
 * Persistence + similarity-search contract for RAG. Implement this to back
 * retrieval with pgvector, a managed vector DB, etc., then register it via
 * `AiModule.forRoot({ vectorStore })`.
 */
export interface VectorStore {
  /** Inserts or replaces documents by id. */
  upsert(documents: VectorDocument[]): Promise<void>;
  /** Returns the closest documents to `embedding`, ranked by similarity. */
  query(
    embedding: number[],
    options?: VectorQueryOptions,
  ): Promise<VectorQueryResult[]>;
  /** Removes documents by id. */
  delete(ids: string[]): Promise<void>;
  /** Removes all documents. */
  clear(): Promise<void>;
}
