import { describe, expect, it, vi } from 'vitest';
import { PgVectorStore, type PgPoolLike } from './pgvector-store.js';

function fakePool(rows: Array<Record<string, any>> = []) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const pool: PgPoolLike = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rows };
    }),
  };
  return { pool, calls };
}

describe('PgVectorStore', () => {
  it('upserts documents with a vector literal and ON CONFLICT', async () => {
    const { pool, calls } = fakePool();
    const store = new PgVectorStore(pool, { table: 'docs' });
    await store.upsert([
      { id: 'a', content: 'hello', embedding: [0.1, 0.2], metadata: { k: 1 } },
    ]);
    expect(calls[0].sql).toContain('INSERT INTO docs');
    expect(calls[0].sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(calls[0].params).toEqual(['a', 'hello', '[0.1,0.2]', '{"k":1}']);
  });

  it('throws when a document lacks an embedding', async () => {
    const { pool } = fakePool();
    const store = new PgVectorStore(pool);
    await expect(
      store.upsert([{ id: 'a', content: 'x' }]),
    ).rejects.toThrow(/no embedding/);
  });

  it('queries by cosine distance and maps rows to results', async () => {
    const { pool, calls } = fakePool([
      { id: 'a', content: 'hello', metadata: { k: 1 }, score: '0.92' },
    ]);
    const store = new PgVectorStore(pool, { table: 'docs' });
    const results = await store.query([0.1, 0.2], { topK: 3 });

    expect(calls[0].sql).toContain('embedding <=> $1');
    expect(calls[0].sql).toContain('ORDER BY embedding <=> $1');
    expect(calls[0].params).toEqual(['[0.1,0.2]', 3]);
    expect(results).toEqual([
      { id: 'a', content: 'hello', score: 0.92, metadata: { k: 1 } },
    ]);
  });

  it('adds a metadata filter clause', async () => {
    const { pool, calls } = fakePool([]);
    const store = new PgVectorStore(pool);
    await store.query([0.1], { filter: { lang: 'en' }, topK: 5 });
    expect(calls[0].sql).toContain('metadata @> $2');
    expect(calls[0].params).toEqual(['[0.1]', '{"lang":"en"}', 5]);
  });

  it('deletes by id and clears', async () => {
    const { pool, calls } = fakePool();
    const store = new PgVectorStore(pool, { table: 'docs' });
    await store.delete(['a', 'b']);
    await store.clear();
    expect(calls[0].sql).toContain('WHERE id = ANY($1)');
    expect(calls[0].params).toEqual([['a', 'b']]);
    expect(calls[1].sql).toContain('DELETE FROM docs');
  });
});
