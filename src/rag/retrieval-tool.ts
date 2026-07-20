import { tool, type Tool as AiTool } from 'ai';
import { z } from 'zod';
import type { RagService } from './rag.service.js';

export interface RetrievalToolOptions {
  /** Tool name exposed to the model (default `"searchKnowledgeBase"`). */
  name?: string;
  /** Tool description guiding when the model should search. */
  description?: string;
  /** Number of chunks to return (default 4). */
  topK?: number;
  /** Embedding model id for the query. */
  model?: string;
  /** Optional metadata filter applied to every retrieval. */
  filter?: Record<string, unknown>;
}

/**
 * Builds a Vercel AI SDK `tool()` that retrieves relevant chunks from a
 * `RagService`, so an agent can ground its answers. Register it by exposing it
 * from a `@Tool`-style provider, or pass its tool set directly to `AiService`.
 *
 * @example
 * ```ts
 * const tool = createRetrievalTool(rag, { topK: 5 });
 * await ai.generateText({ model: 'openai:gpt-4o', tools: { search: tool }, prompt });
 * ```
 */
export function createRetrievalTool(
  rag: RagService,
  options: RetrievalToolOptions = {},
): AiTool<{ query: string }, string> {
  return tool({
    description:
      options.description ??
      'Search the knowledge base for information relevant to the query.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
    }),
    execute: async ({ query }) => {
      const results = await rag.retrieve(query, {
        topK: options.topK,
        model: options.model,
        filter: options.filter,
      });
      if (results.length === 0) {
        return 'No relevant information found.';
      }
      return results.map((r, i) => `[${i + 1}] ${r.content}`).join('\n\n');
    },
  });
}
