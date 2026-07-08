import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  SpeechModel,
  TranscriptionModel,
} from 'ai';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import type {
  AiModuleOptions,
  ProviderConfig,
} from '../interfaces/ai-module-options.interface.js';

type ProviderName = 'openai' | 'anthropic' | 'google';

/**
 * Minimal shape shared by every `@ai-sdk/*` provider instance we support.
 */
interface AiSdkProvider {
  languageModel(modelId: string): LanguageModel;
  textEmbeddingModel?(modelId: string): EmbeddingModel;
  // ProviderV2 standard multimodal methods.
  imageModel?(modelId: string): ImageModel;
  speechModel?(modelId: string): SpeechModel;
  transcriptionModel?(modelId: string): TranscriptionModel;
  // Shorthands exposed by some concrete providers (e.g. openai).
  image?(modelId: string): ImageModel;
  speech?(modelId: string): SpeechModel;
  transcription?(modelId: string): TranscriptionModel;
}

/**
 * Instantiates and caches the configured `@ai-sdk/*` providers, and resolves
 * `"provider:model"` strings into concrete language / embedding models.
 *
 * Provider packages are imported lazily on module init so only the SDKs a
 * project actually configures need to be installed.
 */
@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly providers = new Map<ProviderName, AiSdkProvider>();

  constructor(
    @Inject(AI_MODULE_OPTIONS) private readonly options: AiModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    const configured = this.options.providers ?? {};
    for (const name of Object.keys(configured) as ProviderName[]) {
      const config = configured[name];
      if (config) {
        await this.initProvider(name, config);
      }
    }
  }

  /**
   * Resolves a language model. Accepts a `LanguageModel` instance (returned
   * as-is), a `"provider:model"` string, a bare `"model"` string (using the
   * default provider), or `undefined` (using `defaultModel`).
   */
  getLanguageModel(model?: string | LanguageModel): LanguageModel {
    if (model && typeof model !== 'string') {
      return model;
    }
    const { provider, modelId } = this.resolve(model, this.options.defaultModel);
    return provider.languageModel(modelId);
  }

  /**
   * Resolves an embedding model from a `"provider:model"` string, a bare model
   * string, an `EmbeddingModel` instance, or `undefined` (using
   * `defaultEmbeddingModel`).
   */
  getEmbeddingModel(
    model?: string | EmbeddingModel,
  ): EmbeddingModel {
    if (model && typeof model !== 'string') {
      return model;
    }
    const { name, provider, modelId } = this.resolve(
      model,
      this.options.defaultEmbeddingModel,
    );
    if (typeof provider.textEmbeddingModel !== 'function') {
      throw new Error(
        `Provider "${name}" does not support embeddings. Configure a provider ` +
          `with embedding support (e.g. openai or google).`,
      );
    }
    return provider.textEmbeddingModel(modelId);
  }

  /** Resolves an image-generation model (default `defaultImageModel`). */
  getImageModel(model?: string | ImageModel): ImageModel {
    if (model && typeof model !== 'string') {
      return model;
    }
    return this.resolveMultimodal<ImageModel>(
      model,
      this.options.defaultImageModel,
      ['imageModel', 'image'],
      'image generation',
    );
  }

  /** Resolves a speech (text-to-speech) model (default `defaultSpeechModel`). */
  getSpeechModel(model?: string | SpeechModel): SpeechModel {
    if (model && typeof model !== 'string') {
      return model;
    }
    return this.resolveMultimodal<SpeechModel>(
      model,
      this.options.defaultSpeechModel,
      ['speechModel', 'speech'],
      'speech',
    );
  }

  /** Resolves a transcription (speech-to-text) model. */
  getTranscriptionModel(
    model?: string | TranscriptionModel,
  ): TranscriptionModel {
    if (model && typeof model !== 'string') {
      return model;
    }
    return this.resolveMultimodal<TranscriptionModel>(
      model,
      this.options.defaultTranscriptionModel,
      ['transcriptionModel', 'transcription'],
      'transcription',
    );
  }

  /**
   * Shared resolution for multimodal models: resolves the provider, then calls
   * the first available factory method (standard name, then shorthand).
   */
  private resolveMultimodal<T>(
    model: string | undefined,
    fallback: string | undefined,
    methods: Array<keyof AiSdkProvider>,
    capability: string,
  ): T {
    const { name, provider, modelId } = this.resolve(model, fallback);
    for (const method of methods) {
      const fn = provider[method];
      if (typeof fn === 'function') {
        return (fn as (id: string) => T).call(provider, modelId);
      }
    }
    throw new Error(
      `Provider "${name}" does not support ${capability}. Configure a provider ` +
        `that does (e.g. openai).`,
    );
  }

  private resolve(
    model: string | undefined,
    fallback: string | undefined,
  ): { name: ProviderName; provider: AiSdkProvider; modelId: string } {
    const raw = model ?? fallback;
    if (!raw) {
      throw new Error(
        'No model specified and no default model configured. Pass a model id ' +
          'or set `defaultModel` in AiModule options.',
      );
    }

    const name = this.parseProviderName(raw);
    const modelId = this.parseModelId(raw);
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `Provider "${name}" is not configured. Add it to AiModule ` +
          `\`providers\` options and install \`@ai-sdk/${name}\`.`,
      );
    }
    return { name, provider, modelId };
  }

  private parseProviderName(raw: string): ProviderName {
    const sep = raw.indexOf(':');
    if (sep !== -1) {
      return raw.slice(0, sep) as ProviderName;
    }
    // Bare model id: use the sole configured provider, else the default
    // model's provider prefix.
    if (this.providers.size === 1) {
      return this.providers.keys().next().value as ProviderName;
    }
    const def = this.options.defaultModel;
    if (def && def.includes(':')) {
      return def.slice(0, def.indexOf(':')) as ProviderName;
    }
    throw new Error(
      `Cannot infer provider for model "${raw}". Prefix it as ` +
        `"provider:model" (e.g. "openai:${raw}").`,
    );
  }

  private parseModelId(raw: string): string {
    const sep = raw.indexOf(':');
    return sep !== -1 ? raw.slice(sep + 1) : raw;
  }

  private async initProvider(
    name: ProviderName,
    config: ProviderConfig,
  ): Promise<void> {
    const settings = {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      headers: config.headers,
    };
    try {
      switch (name) {
        case 'openai': {
          const { createOpenAI } = await import('@ai-sdk/openai');
          this.providers.set(name, createOpenAI(settings) as AiSdkProvider);
          break;
        }
        case 'anthropic': {
          const { createAnthropic } = await import('@ai-sdk/anthropic');
          this.providers.set(name, createAnthropic(settings) as AiSdkProvider);
          break;
        }
        case 'google': {
          const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
          this.providers.set(
            name,
            createGoogleGenerativeAI(settings) as AiSdkProvider,
          );
          break;
        }
        default: {
          throw new Error(`Unknown provider "${name}".`);
        }
      }
    } catch (error) {
      if (error instanceof Error && /Cannot find|find module/i.test(error.message)) {
        throw new Error(
          `Provider "${name}" is configured but the package "@ai-sdk/${name}" ` +
            `is not installed. Run \`npm install @ai-sdk/${name}\`.`,
        );
      }
      throw error;
    }
  }
}
