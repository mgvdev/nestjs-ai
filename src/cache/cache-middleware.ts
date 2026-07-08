import type { LanguageModelMiddleware } from 'ai';
import type { AiCache } from './ai-cache.interface.js';

export interface CacheMiddlewareOptions {
  /** Time-to-live for cached generations, in milliseconds (default: no expiry). */
  ttlMs?: number;
}

/**
 * Language-model middleware that caches non-streaming generations in an
 * {@link AiCache}, keyed by the model id and call parameters. Wrap a model with
 * `wrapLanguageModel({ model, middleware: createCacheMiddleware(cache) })`.
 */
export function createCacheMiddleware(
  cache: AiCache,
  options: CacheMiddlewareOptions = {},
): LanguageModelMiddleware {
  return {
    async wrapGenerate({ doGenerate, params, model }) {
      const key = cacheKey(model.modelId, params);
      const cached = await cache.get(key);
      if (cached !== undefined) {
        return cached as Awaited<ReturnType<typeof doGenerate>>;
      }
      const result = await doGenerate();
      await cache.set(key, result, options.ttlMs);
      return result;
    },
  };
}

/** Builds a stable cache key from the model id and call parameters. */
export function cacheKey(modelId: string, params: unknown): string {
  return `${modelId}:${stableStringify(params)}`;
}

/** JSON stringify with sorted object keys for deterministic keys. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}
