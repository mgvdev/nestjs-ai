import { describe, expect, it, vi } from 'vitest';
import {
  QdrantVectorStore,
  type QdrantClientLike,
} from './qdrant/qdrant-vector-store.js';
import {
  PineconeVectorStore,
  type PineconeIndexLike,
} from './pinecone/pinecone-vector-store.js';

describe('QdrantVectorStore', () => {
  it('upserts points with content in the payload', async () => {
    const upsert = vi.fn(async () => ({}));
    const client = {
      upsert,
      search: vi.fn(),
      delete: vi.fn(),
    } as QdrantClientLike;
    const store = new QdrantVectorStore(client, { collection: 'docs' });
    await store.upsert([
      { id: 'a', content: 'hello', embedding: [0.1], metadata: { lang: 'en' } },
    ]);
    expect(upsert).toHaveBeenCalledWith('docs', {
      wait: true,
      points: [
        { id: 'a', vector: [0.1], payload: { content: 'hello', lang: 'en' } },
      ],
    });
  });

  it('maps search hits and builds a filter', async () => {
    const search = vi.fn(async () => [
      { id: 'a', score: 0.9, payload: { content: 'hello', lang: 'en' } },
    ]);
    const client = {
      upsert: vi.fn(),
      search,
      delete: vi.fn(),
    } as QdrantClientLike;
    const store = new QdrantVectorStore(client, { collection: 'docs' });
    const out = await store.query([0.1], { topK: 3, filter: { lang: 'en' } });

    expect(search).toHaveBeenCalledWith('docs', {
      vector: [0.1],
      limit: 3,
      with_payload: true,
      filter: { must: [{ key: 'lang', match: { value: 'en' } }] },
    });
    expect(out).toEqual([
      { id: 'a', content: 'hello', score: 0.9, metadata: { lang: 'en' } },
    ]);
  });
});

describe('PineconeVectorStore', () => {
  it('upserts vectors with content metadata', async () => {
    const upsert = vi.fn(async () => ({}));
    const index = {
      upsert,
      query: vi.fn(),
      deleteMany: vi.fn(),
      deleteAll: vi.fn(),
    } as PineconeIndexLike;
    const store = new PineconeVectorStore(index);
    await store.upsert([{ id: 'a', content: 'hi', embedding: [0.2] }]);
    expect(upsert).toHaveBeenCalledWith([
      { id: 'a', values: [0.2], metadata: { content: 'hi' } },
    ]);
  });

  it('maps query matches', async () => {
    const query = vi.fn(async () => ({
      matches: [{ id: 'a', score: 0.8, metadata: { content: 'hi', k: 1 } }],
    }));
    const index = {
      upsert: vi.fn(),
      query,
      deleteMany: vi.fn(),
      deleteAll: vi.fn(),
    } as PineconeIndexLike;
    const store = new PineconeVectorStore(index);
    const out = await store.query([0.2], { topK: 2 });
    expect(out).toEqual([
      { id: 'a', content: 'hi', score: 0.8, metadata: { k: 1 } },
    ]);
  });
});
