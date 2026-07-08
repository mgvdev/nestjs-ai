import {
  type DynamicModule,
  Global,
  Module,
  type Provider,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AI_MODULE_OPTIONS, CONVERSATION_STORE } from './ai.constants.js';
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

/**
 * Root module for `@mgvdev/nestjs-ai`. Registered globally so agents, tools and
 * services are available everywhere once configured.
 */
@Global()
@Module({})
export class AiModule {
  /** Configure the module with static options. */
  static forRoot(options: AiModuleOptions = {}): DynamicModule {
    return {
      module: AiModule,
      imports: [DiscoveryModule],
      providers: [
        { provide: AI_MODULE_OPTIONS, useValue: options },
        AiModule.storeProvider(options.conversationStore),
        ...AiModule.coreProviders(),
      ],
      exports: AiModule.exportedTokens(),
    };
  }

  /** Configure the module asynchronously (e.g. from `ConfigService`). */
  static forRootAsync(options: AiModuleAsyncOptions): DynamicModule {
    return {
      module: AiModule,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: AI_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        AiModule.storeProvider(options.conversationStore),
        ...AiModule.coreProviders(),
      ],
      exports: AiModule.exportedTokens(),
    };
  }

  /**
   * Convenience registration of agent/tool classes so they don't have to be
   * added to a consuming module's own `providers` array. Discovery still finds
   * tools globally regardless of where they're registered.
   */
  static forFeature(feature: AiFeatureOptions = {}): DynamicModule {
    const providers: Provider[] = [
      ...(feature.agents ?? []),
      ...(feature.tools ?? []),
    ];
    return {
      module: AiModule,
      providers,
      exports: providers,
    };
  }

  private static coreProviders(): Provider[] {
    return [
      ProviderRegistry,
      ToolRegistry,
      AgentExecutorService,
      AiService,
      EmbeddingsService,
    ];
  }

  private static exportedTokens(): any[] {
    return [
      ProviderRegistry,
      ToolRegistry,
      AgentExecutorService,
      AiService,
      EmbeddingsService,
      CONVERSATION_STORE,
      AI_MODULE_OPTIONS,
    ];
  }

  private static storeProvider(
    store?: ConversationStoreProvider,
  ): Provider {
    if (!store) {
      return { provide: CONVERSATION_STORE, useClass: InMemoryConversationStore };
    }
    if (typeof store === 'function') {
      return { provide: CONVERSATION_STORE, useClass: store };
    }
    return { provide: CONVERSATION_STORE, ...store } as Provider;
  }
}
