import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider';
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/**
 * Builds a mock language model that returns the given text reply(ies). An array
 * yields one reply per successive call (multi-step); the last is reused after.
 */
export function createMockModel(
  replies: string | string[],
): LanguageModelV3 {
  const texts = Array.isArray(replies) ? replies : [replies];
  const results = texts.map((text) => ({
    content: [{ type: 'text', text }],
    finishReason: 'stop',
    usage: ZERO_USAGE,
    warnings: [],
  }));
  let call = 0;
  return new MockLanguageModelV3({
    doGenerate: async () =>
      results[Math.min(call++, results.length - 1)] as any,
  });
}

/**
 * Builds a mock embedding model whose vectors come from `embed(value)`.
 */
export function createEmbeddingMock(
  embed: (value: string) => number[],
): EmbeddingModelV3 {
  return new MockEmbeddingModelV3({
    doEmbed: async ({ values }: { values: string[] }) =>
      ({
        embeddings: values.map(embed),
        usage: { tokens: values.length },
      }) as any,
  });
}
