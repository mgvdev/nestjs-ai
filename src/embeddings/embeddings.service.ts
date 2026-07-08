import { Inject, Injectable, Optional } from '@nestjs/common';
import { embed, embedMany } from 'ai';
import { AI_CACHE } from '../ai.constants.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import type { AiCache } from '../cache/ai-cache.interface.js';

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
  constructor(
    private readonly providers: ProviderRegistry,
    @Optional() @Inject(AI_CACHE) private readonly cache?: AiCache,
  ) {}

  /** Embeds a single value (cached when a cache is configured). */
  async embed(value: string, options: EmbedOptions = {}) {
    const model = this.providers.getEmbeddingModel(options.model);
    const key = `emb:${(model as { modelId?: string }).modelId ?? ''}:${value}`;

    if (this.cache) {
      const hit = await this.cache.get(key);
      if (hit !== undefined) {
        return hit as Awaited<ReturnType<typeof embed>>;
      }
    }

    const result = await embed({
      model,
      value,
      abortSignal: options.abortSignal,
      maxRetries: options.maxRetries,
    });

    if (this.cache) {
      await this.cache.set(key, result);
    }
    return result;
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
