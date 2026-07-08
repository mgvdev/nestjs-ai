import { describe, expect, it } from 'vitest';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import { ProviderRegistry } from './provider-registry.js';

async function makeRegistry(options: AiModuleOptions): Promise<ProviderRegistry> {
  const registry = new ProviderRegistry(options);
  await registry.onModuleInit();
  return registry;
}

describe('ProviderRegistry', () => {
  it('resolves a "provider:model" language model', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
    });
    const model = registry.getLanguageModel('openai:gpt-4o');
    expect(model.modelId).toBe('gpt-4o');
  });

  it('infers the provider for a bare model when only one is configured', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
    });
    expect(registry.getLanguageModel('gpt-4o-mini').modelId).toBe('gpt-4o-mini');
  });

  it('falls back to defaultModel when no id is passed', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
      defaultModel: 'openai:gpt-4o',
    });
    expect(registry.getLanguageModel().modelId).toBe('gpt-4o');
  });

  it('returns a LanguageModel instance unchanged', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
    });
    const model = registry.getLanguageModel('openai:gpt-4o');
    expect(registry.getLanguageModel(model)).toBe(model);
  });

  it('resolves an embedding model', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
    });
    const model = registry.getEmbeddingModel('openai:text-embedding-3-small');
    expect(model.modelId).toBe('text-embedding-3-small');
  });

  it('throws for a provider without embedding support', async () => {
    const registry = await makeRegistry({
      providers: { anthropic: { apiKey: 'test' } },
    });
    expect(() =>
      registry.getEmbeddingModel('anthropic:whatever'),
    ).toThrowError(/embedding|textEmbeddingModel/i);
  });

  it('resolves image, speech and transcription models', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
    });
    expect(registry.getImageModel('openai:dall-e-3').modelId).toBe('dall-e-3');
    expect(registry.getSpeechModel('openai:tts-1').modelId).toBe('tts-1');
    expect(registry.getTranscriptionModel('openai:whisper-1').modelId).toBe(
      'whisper-1',
    );
  });

  it('uses default multimodal models when no id is passed', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
      defaultImageModel: 'openai:dall-e-3',
    });
    expect(registry.getImageModel().modelId).toBe('dall-e-3');
  });

  it('throws for a provider without image support', async () => {
    const registry = await makeRegistry({
      providers: { anthropic: { apiKey: 'test' } },
    });
    expect(() => registry.getImageModel('anthropic:x')).toThrowError(
      /image/i,
    );
  });

  it('throws for an unconfigured provider', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
    });
    expect(() => registry.getLanguageModel('google:gemini-1.5-pro')).toThrowError(
      /not configured/,
    );
  });

  it('throws when no model and no default are available', async () => {
    const registry = await makeRegistry({
      providers: { openai: { apiKey: 'test' } },
    });
    expect(() => registry.getLanguageModel()).toThrowError(/No model specified/);
  });

  it('is constructible from the DI token value', () => {
    const options: AiModuleOptions = { providers: { openai: { apiKey: 'x' } } };
    // sanity check that the token is a symbol usable as a provide key
    expect(typeof AI_MODULE_OPTIONS).toBe('symbol');
    expect(new ProviderRegistry(options)).toBeInstanceOf(ProviderRegistry);
  });
});
