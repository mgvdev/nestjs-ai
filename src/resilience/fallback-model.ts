import type { LanguageModelV3 } from '@ai-sdk/provider';

export interface FallbackOptions {
  /**
   * Decide whether an error from a model should trigger a fallback to the next
   * one. Defaults to always retrying on the next model.
   */
  shouldRetry?: (error: unknown) => boolean;
  /** Provider name reported by the composite model. */
  provider?: string;
}

/**
 * Composes several language models into one that tries each in order, falling
 * back to the next when a model throws (subject to `shouldRetry`). Fallback
 * applies to the initial `doGenerate` / `doStream` call; once a stream starts it
 * is not switched mid-flight.
 *
 * @example
 * ```ts
 * const model = createFallbackModel([
 *   registry.getLanguageModel('openai:gpt-4o'),
 *   registry.getLanguageModel('anthropic:claude-sonnet-5'),
 * ]);
 * ```
 */
export function createFallbackModel(
  models: LanguageModelV3[],
  options: FallbackOptions = {},
): LanguageModelV3 {
  if (models.length === 0) {
    throw new Error('createFallbackModel requires at least one model.');
  }
  const primary = models[0];
  const shouldRetry = options.shouldRetry ?? (() => true);

  async function attempt<T>(
    call: (model: LanguageModelV3) => PromiseLike<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < models.length; i++) {
      try {
        return await call(models[i]);
      } catch (error) {
        lastError = error;
        const isLast = i === models.length - 1;
        if (isLast || !shouldRetry(error)) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  return {
    specificationVersion: 'v3',
    provider: options.provider ?? `fallback(${primary.provider})`,
    modelId: primary.modelId,
    get supportedUrls() {
      return primary.supportedUrls;
    },
    doGenerate: (callOptions) =>
      attempt((model) => model.doGenerate(callOptions)),
    doStream: (callOptions) => attempt((model) => model.doStream(callOptions)),
  };
}
