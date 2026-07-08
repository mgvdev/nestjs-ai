import { Inject, Injectable, Optional } from '@nestjs/common';
import { VECTOR_STORE } from '../../ai.constants.js';
import { EmbeddingsService } from '../../embeddings/embeddings.service.js';
import { AiService } from '../../core/ai.service.js';
import type {
  VectorQueryResult,
  VectorStore,
} from '../../rag/vector-store.interface.js';
import { type AiInput, toMessages } from '../../messages/message.types.js';

export interface RecallOptions {
  topK?: number;
  model?: string;
}

/**
 * Long-term semantic memory: stores snippets per conversation as embeddings and
 * recalls the most relevant ones for a query. Backed by the configured
 * `VectorStore` (isolated per conversation via metadata).
 */
@Injectable()
export class SemanticMemory {
  constructor(
    private readonly embeddings: EmbeddingsService,
    @Inject(VECTOR_STORE) private readonly store: VectorStore,
    @Optional() private readonly ai?: AiService,
  ) {}

  /** Embeds and stores a snippet under a conversation. */
  async remember(
    conversationId: string,
    text: string,
    options: { model?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<void> {
    const { embedding } = await this.embeddings.embed(text, {
      model: options.model,
    });
    await this.store.upsert([
      {
        id: `mem:${conversationId}:${hash(text)}`,
        content: text,
        embedding,
        metadata: { conversationId, kind: 'memory', ...options.metadata },
      },
    ]);
  }

  /** Returns the most relevant stored snippets for a query. */
  async recall(
    conversationId: string,
    query: string,
    options: RecallOptions = {},
  ): Promise<VectorQueryResult[]> {
    const { embedding } = await this.embeddings.embed(query, {
      model: options.model,
    });
    return this.store.query(embedding, {
      topK: options.topK ?? 4,
      filter: { conversationId, kind: 'memory' },
    });
  }

  /**
   * Summarizes messages with the LLM (requires `AiService`), then stores the
   * summary as a memory snippet. Returns the stored text.
   */
  async rememberConversation(
    conversationId: string,
    input: AiInput,
    options: { summarize?: boolean; model?: string } = {},
  ): Promise<string> {
    const text = options.summarize
      ? await this.summarize(input, options.model)
      : messagesToText(input);
    await this.remember(conversationId, text, { model: options.model });
    return text;
  }

  /** Summarizes messages into a compact string via the LLM. */
  async summarize(input: AiInput, model?: string): Promise<string> {
    if (!this.ai) {
      throw new Error('SemanticMemory.summarize requires AiService.');
    }
    const { text } = await this.ai.generateText({
      model,
      prompt: `Summarize the following conversation concisely:\n\n${messagesToText(input)}`,
    });
    return text;
  }
}

function messagesToText(input: AiInput): string {
  return toMessages(input)
    .map((m) => {
      const content = (m as { content: unknown }).content;
      if (typeof content === 'string') {
        return `${m.role}: ${content}`;
      }
      if (Array.isArray(content)) {
        return `${m.role}: ${content
          .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
          .join(' ')}`;
      }
      return '';
    })
    .join('\n');
}

/** Small deterministic string hash (djb2) for stable snippet ids. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
