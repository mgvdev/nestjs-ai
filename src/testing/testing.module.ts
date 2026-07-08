import type { Provider } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider';
import { AiModule } from '../ai.module.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import { createEmbeddingMock, createMockModel } from './mock-model.js';

export interface TestingAiModuleOptions {
  /** Mock language model (default: replies "mock response"). */
  model?: LanguageModelV3;
  /** Mock embedding model (default: zero vector). */
  embedding?: EmbeddingModelV3;
  /** Extra providers (agents, tools, guardrails) to register. */
  providers?: Provider[];
  /** Extra modules to import. */
  imports?: any[];
  /** AiModule options (default: a dummy openai provider). */
  aiOptions?: AiModuleOptions;
}

/**
 * Boots a NestJS testing module with `AiModule` and a `ProviderRegistry`
 * overridden to serve mock models — no API keys or network. Returns the
 * initialized module; `get()` your agents/services from it.
 *
 * @example
 * ```ts
 * const app = await createTestingAiModule({
 *   model: createMockModel('Hello!'),
 *   providers: [MyAgent],
 * });
 * const { text } = await app.get(MyAgent).run('hi');
 * ```
 */
export async function createTestingAiModule(
  options: TestingAiModuleOptions = {},
): Promise<TestingModule> {
  const model = options.model ?? createMockModel('mock response');
  const embedding = options.embedding ?? createEmbeddingMock(() => [0]);

  const moduleRef = await Test.createTestingModule({
    imports: [
      AiModule.forRoot(
        options.aiOptions ?? { providers: { openai: { apiKey: 'test' } } },
      ),
      ...(options.imports ?? []),
    ],
    providers: options.providers ?? [],
  })
    .overrideProvider(ProviderRegistry)
    .useValue({
      getLanguageModel: () => model,
      getEmbeddingModel: () => embedding,
      getImageModel: () => {
        throw new Error('No image model mock configured.');
      },
      getSpeechModel: () => {
        throw new Error('No speech model mock configured.');
      },
      getTranscriptionModel: () => {
        throw new Error('No transcription model mock configured.');
      },
      getRerankingModel: () => {
        throw new Error('No reranking model mock configured.');
      },
    } as unknown as ProviderRegistry)
    .compile();

  await moduleRef.init();
  return moduleRef;
}
