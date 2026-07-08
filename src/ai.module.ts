import {
  type DynamicModule,
  Global,
  Module,
  type Provider,
  type Type,
} from '@nestjs/common';
import { DiscoveryModule, ModuleRef } from '@nestjs/core';
import {
  AI_MODULE_OPTIONS,
  CONVERSATION_STORE,
  VECTOR_STORE,
} from './ai.constants.js';
import type {
  AiFeatureOptions,
  AiModuleAsyncOptions,
  AiModuleOptions,
  ConversationStoreProvider,
} from './interfaces/ai-module-options.interface.js';
import { ProviderRegistry } from './core/provider-registry.js';
import { AiService } from './core/ai.service.js';
import { ToolRegistry } from './tools/tool.registry.js';
import { AgentExecutorService } from './agent/agent-executor.service.js';
import { EmbeddingsService } from './embeddings/embeddings.service.js';
import { InMemoryConversationStore } from './memory/in-memory-conversation.store.js';
import { ImageService } from './multimodal/image.service.js';
import { SpeechService } from './multimodal/speech.service.js';
import { TranscriptionService } from './multimodal/transcription.service.js';
import { RagService } from './rag/rag.service.js';
import { InMemoryVectorStore } from './rag/in-memory-vector-store.js';
import { PromptRegistry } from './prompts/prompt-registry.service.js';
import {
  AiEventEmitter,
  EVENT_EMITTER,
} from './observability/ai-event-emitter.js';
import { GuardrailRegistry } from './observability/guardrail.registry.js';

const AI_INITIALIZER = Symbol('AI_INITIALIZER');

/**
 * Root module for `@mgvdev/nestjs-ai`. Registered globally so agents, tools and
 * services are available everywhere once configured.
 */
@Global()
@Module({})
export class AiModule {
  /** Configure the module with static options. */
  static forRoot(options: AiModuleOptions = {}): DynamicModule {
    return AiModule.build(
      { provide: AI_MODULE_OPTIONS, useValue: options },
      options,
    );
  }

  /** Configure the module asynchronously (e.g. from `ConfigService`). */
  static forRootAsync(options: AiModuleAsyncOptions): DynamicModule {
    return AiModule.build(
      {
        provide: AI_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      options,
      options.imports,
    );
  }

  /**
   * Convenience registration of agents / tools / guardrails so they don't have
   * to be added to a consuming module's own `providers` array, plus feature
   * prompts. Discovery still finds providers globally regardless of where they
   * are registered.
   */
  static forFeature(feature: AiFeatureOptions = {}): DynamicModule {
    const providers: Provider[] = [
      ...(feature.agents ?? []),
      ...(feature.tools ?? []),
      ...(feature.guardrails ?? []),
    ];
    if (feature.prompts?.length) {
      providers.push({
        provide: Symbol('AI_FEATURE_PROMPTS'),
        useFactory: (registry: PromptRegistry) => {
          registry.registerAll(feature.prompts!);
          return true;
        },
        inject: [PromptRegistry],
      });
    }
    return { module: AiModule, providers, exports: providers };
  }

  private static build(
    optionsProvider: Provider,
    options: Partial<AiModuleOptions> & {
      conversationStore?: ConversationStoreProvider;
    },
    extraImports: DynamicModule['imports'] = [],
  ): DynamicModule {
    return {
      module: AiModule,
      imports: [DiscoveryModule, ...(extraImports ?? [])],
      providers: [
        optionsProvider,
        AiModule.storeProvider(options.conversationStore),
        AiModule.vectorStoreProvider(options.vectorStore),
        AiModule.eventEmitterProvider(),
        ...AiModule.guardrailClasses(options.guardrails),
        ...AiModule.coreProviders(),
        AiModule.initializerProvider(),
      ],
      exports: AiModule.exportedTokens(),
    };
  }

  private static coreProviders(): Provider[] {
    return [
      ProviderRegistry,
      ToolRegistry,
      AgentExecutorService,
      AiService,
      EmbeddingsService,
      ImageService,
      SpeechService,
      TranscriptionService,
      RagService,
      PromptRegistry,
      AiEventEmitter,
      GuardrailRegistry,
    ];
  }

  private static exportedTokens(): any[] {
    return [
      ProviderRegistry,
      ToolRegistry,
      AgentExecutorService,
      AiService,
      EmbeddingsService,
      ImageService,
      SpeechService,
      TranscriptionService,
      RagService,
      PromptRegistry,
      AiEventEmitter,
      GuardrailRegistry,
      CONVERSATION_STORE,
      VECTOR_STORE,
      AI_MODULE_OPTIONS,
    ];
  }

  private static guardrailClasses(guardrails?: Type<any>[]): Provider[] {
    return guardrails ?? [];
  }

  /** Seeds prompts (and future startup wiring) once dependencies exist. */
  private static initializerProvider(): Provider {
    return {
      provide: AI_INITIALIZER,
      useFactory: (registry: PromptRegistry, opts: AiModuleOptions) => {
        if (opts.prompts?.length) {
          registry.registerAll(opts.prompts);
        }
        return true;
      },
      inject: [PromptRegistry, AI_MODULE_OPTIONS],
    };
  }

  /**
   * Optionally resolves `EventEmitter2` from `@nestjs/event-emitter` if the
   * package is installed and its module is imported; otherwise `undefined`.
   */
  private static eventEmitterProvider(): Provider {
    return {
      provide: EVENT_EMITTER,
      useFactory: async (moduleRef: ModuleRef) => {
        try {
          const mod: any = await import('@nestjs/event-emitter');
          return moduleRef.get(mod.EventEmitter2, { strict: false });
        } catch {
          return undefined;
        }
      },
      inject: [ModuleRef],
    };
  }

  private static storeProvider(store?: ConversationStoreProvider): Provider {
    if (!store) {
      return {
        provide: CONVERSATION_STORE,
        useClass: InMemoryConversationStore,
      };
    }
    if (typeof store === 'function') {
      return { provide: CONVERSATION_STORE, useClass: store };
    }
    return { provide: CONVERSATION_STORE, ...store } as Provider;
  }

  private static vectorStoreProvider(
    store?: AiModuleOptions['vectorStore'],
  ): Provider {
    if (!store) {
      return { provide: VECTOR_STORE, useClass: InMemoryVectorStore };
    }
    if (typeof store === 'function') {
      return { provide: VECTOR_STORE, useClass: store };
    }
    return { provide: VECTOR_STORE, ...store } as Provider;
  }
}
