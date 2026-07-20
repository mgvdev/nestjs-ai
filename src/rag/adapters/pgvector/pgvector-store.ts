import type {
  VectorDocument,
  VectorQueryOptions,
  VectorQueryResult,
  VectorStore,
} from '../../vector-store.interface.js';

/** Structural interface for a `pg` Pool/Client (only `query` is used). */
export interface PgPoolLike {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, any>> }>;
}

export interface PgVectorStoreOptions {
  /** Table name (default `"ai_documents"`). */
  table?: string;
}

/**
 * `VectorStore` backed by Postgres + the `pgvector` extension. Pass a `pg`
 * `Pool` (or any object with a compatible `query`). Expects a table like:
 *
 * ```sql
 * CREATE EXTENSION IF NOT EXISTS vector;
 * CREATE TABLE ai_documents (
 *   id text PRIMARY KEY,
 *   content text NOT NULL,
 *   embedding vector(1536) NOT NULL,
 *   metadata jsonb
 * );
 * CREATE INDEX ON ai_documents USING hnsw (embedding vector_cosine_ops);
 * ```
 */
export class PgVectorStore implements VectorStore {
  private readonly table: string;

  constructor(
    private readonly pool: PgPoolLike,
    options: PgVectorStoreOptions = {},
  ) {
    this.table = options.table ?? 'ai_documents';
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      if (!doc.embedding) {
        throw new Error(
          `Document "${doc.id}" has no embedding. PgVectorStore requires ` +
            `precomputed embeddings (use RagService.ingest).`,
        );
      }
      await this.pool.query(
        `INSERT INTO ${this.table} (id, content, embedding, metadata)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET content = EXCLUDED.content,
             embedding = EXCLUDED.embedding,
             metadata = EXCLUDED.metadata`,
        [
          doc.id,
          doc.content,
          toVectorLiteral(doc.embedding),
          doc.metadata ? JSON.stringify(doc.metadata) : null,
        ],
      );
    }
  }

  async query(
    embedding: number[],
    options: VectorQueryOptions = {},
  ): Promise<VectorQueryResult[]> {
    const topK = options.topK ?? 4;
    const vector = toVectorLiteral(embedding);
    const params: unknown[] = [vector];
    let where = '';
    if (options.filter) {
      params.push(JSON.stringify(options.filter));
      where = `WHERE metadata @> $${params.length}`;
    }
    params.push(topK);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query(
      `SELECT id, content, metadata, 1 - (embedding <=> $1) AS score
       FROM ${this.table}
       ${where}
       ORDER BY embedding <=> $1
       LIMIT ${limitParam}`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      score: Number(row.score),
      metadata: row.metadata ?? undefined,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.pool.query(`DELETE FROM ${this.table} WHERE id = ANY($1)`, [
      ids,
    ]);
  }

  async clear(): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.table}`);
  }
}

/** Formats an embedding as a pgvector literal, e.g. `[0.1,0.2]`. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
