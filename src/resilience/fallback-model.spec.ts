import type { LanguageModelV3 } from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';
import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { createFallbackModel } from './fallback-model.js';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function okModel(text: string): LanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: USAGE,
      warnings: [],
    }),
  });
}

function failingModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error('provider down');
    },
  });
}

describe('createFallbackModel', () => {
  it('uses the first model when it succeeds', async () => {
    const model = createFallbackModel([
      okModel('primary'),
      okModel('secondary'),
    ]);
    const { text } = await generateText({ model, prompt: 'hi' });
    expect(text).toBe('primary');
  });

  it('falls back to the next model on error', async () => {
    const model = createFallbackModel([failingModel(), okModel('secondary')]);
    const { text } = await generateText({ model, prompt: 'hi' });
    expect(text).toBe('secondary');
  });

  it('throws when every model fails', async () => {
    const model = createFallbackModel([failingModel(), failingModel()]);
    await expect(generateText({ model, prompt: 'hi' })).rejects.toThrow(
      /provider down/,
    );
  });

  it('respects shouldRetry=false (no fallback)', async () => {
    const model = createFallbackModel([failingModel(), okModel('secondary')], {
      shouldRetry: () => false,
    });
    await expect(generateText({ model, prompt: 'hi' })).rejects.toThrow(
      /provider down/,
    );
  });

  it('throws for an empty model list', () => {
    expect(() => createFallbackModel([])).toThrowError(/at least one model/);
  });
});
