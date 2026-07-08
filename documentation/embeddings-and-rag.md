# Embeddings & RAG

## Embeddings

```ts
import { EmbeddingsService } from '@mgvdev/nestjs-ai';

@Injectable()
export class SearchService {
  constructor(private readonly embeddings: EmbeddingsService) {}

  async run(docs: string[]) {
    const { embedding } = await this.embeddings.embed('hello');
    const { embeddings } = await this.embeddings.embedMany(docs);
    return embeddings;
  }
}
```

Model resolves from `defaultEmbeddingModel` or the `model` option. When a
[cache](./reliability.md#caching) is configured, single `embed` calls are cached.

## RAG

`RagService` chunks, embeds, and stores documents, then retrieves the most
relevant chunks for a query.

```ts
await this.rag.ingest(
  [{ id: 'handbook', content: longText, metadata: { source: 'hr' } }],
  { chunkSize: 1000, chunkOverlap: 100 },
);

const hits = await this.rag.retrieve('vacation policy', { topK: 4 });
// hits: { id, content, score, metadata }[]
```

### Expose retrieval to an agent

A `@Tool` method that calls `RagService`:

```ts
@Injectable()
export class KnowledgeTools {
  constructor(private readonly rag: RagService) {}

  @Tool({ description: 'Search the handbook', schema: z.object({ query: z.string() }) })
  async search({ query }: { query: string }) {
    const hits = await this.rag.retrieve(query);
    return hits.map((h) => h.content).join('\n\n');
  }
}
```

Or use the factory:

```ts
import { createRetrievalTool } from '@mgvdev/nestjs-ai';
const tool = createRetrievalTool(rag, { topK: 5 });
await this.ai.generateText({ model: 'openai:gpt-4o', tools: { search: tool }, prompt });
```

## Reranking

Fetch more candidates then rerank down to `topK`:

```ts
const hits = await this.rag.retrieve('query', { topK: 4, rerank: true }); // heuristic default
```

- `rerank: true` uses the configured default (`HeuristicReranker`, no dependency).
- Pass a `Reranker` to override; `ModelReranker` uses the AI SDK `rerank()` with a
  rerank-capable provider (`rerankingModel`, e.g. Cohere).

## Vector stores

The default store is `InMemoryVectorStore` (cosine similarity). Swap it via
`vectorStore`:

```ts
// pgvector — pass your own `pg` Pool
AiModule.forRoot({ vectorStore: { useFactory: () => new PgVectorStore(pool, { table: 'ai_documents' }) } });

// Qdrant
AiModule.forRoot({ vectorStore: { useFactory: () => new QdrantVectorStore(qdrant, { collection: 'docs' }) } });

// Pinecone
AiModule.forRoot({ vectorStore: { useFactory: () => new PineconeVectorStore(index) } });
```

Implement the `VectorStore` interface (`upsert` / `query` / `delete` / `clear`)
for any other backend.

### pgvector schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE ai_documents (
  id text PRIMARY KEY,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb
);
CREATE INDEX ON ai_documents USING hnsw (embedding vector_cosine_ops);
```
