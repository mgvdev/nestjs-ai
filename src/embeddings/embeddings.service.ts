import { Injectable } from '@nestjs/common';
import { embed, embedMany } from 'ai';
import { ProviderRegistry } from '../core/provider-registry.js';

export interface EmbedOptions {
  /** Embedding model id, e.g. `"openai:text-embedding-3-small"`. */
  model?: string;
  abortSignal?: AbortSignal;
  maxRetries?: number;
}

/**
 * Generates vector embeddings for semantic search, clustering, and similarity.
 * Wraps the Vercel AI SDK's `embed` / `embedMany`.
 */
@Injectable()
export class EmbeddingsService {
  constructor(private readonly providers: ProviderRegistry) {}

  /** Embeds a single value. */
  async embed(value: string, options: EmbedOptions = {}) {
    return embed({
      model: this.providers.getEmbeddingModel(options.model),
      value,
      abortSignal: options.abortSignal,
      maxRetries: options.maxRetries,
    });
  }

  /** Embeds many values (the SDK batches automatically). */
  async embedMany(values: string[], options: EmbedOptions = {}) {
    return embedMany({
      model: this.providers.getEmbeddingModel(options.model),
      values,
      abortSignal: options.abortSignal,
      maxRetries: options.maxRetries,
    });
  }
}
