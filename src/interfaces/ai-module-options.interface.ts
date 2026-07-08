import type { ModuleMetadata, Type } from '@nestjs/common';
import type { ConversationStore } from '../memory/conversation-store.interface.js';

/**
 * Ways to supply a custom conversation store: a class, or a class/factory/value
 * provider (registered under the internal store token).
 */
export type ConversationStoreProvider =
  | Type<ConversationStore>
  | { useClass: Type<ConversationStore> }
  | {
      useFactory: (...args: any[]) => ConversationStore | Promise<ConversationStore>;
      inject?: any[];
    }
  | { useValue: ConversationStore };

/**
 * Per-provider configuration. Every field is optional so a provider can also
 * rely on its SDK's implicit environment variables (e.g. `OPENAI_API_KEY`).
 */
export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  /** Extra headers forwarded on every request to this provider. */
  headers?: Record<string, string>;
}

/**
 * Providers the module knows how to instantiate out of the box. The matching
 * `@ai-sdk/*` package must be installed for a configured provider to resolve.
 */
export interface ProvidersConfig {
  openai?: ProviderConfig;
  anthropic?: ProviderConfig;
  google?: ProviderConfig;
}

export interface AiModuleOptions {
  /** Provider credentials keyed by provider name. */
  providers?: ProvidersConfig;
  /**
   * Model used when a call does not specify one, e.g. `"openai:gpt-4o"` or a
   * bare `"gpt-4o"` when a single provider is configured.
   */
  defaultModel?: string;
  /** Default embedding model, e.g. `"openai:text-embedding-3-small"`. */
  defaultEmbeddingModel?: string;
  /** Default maximum tool-calling steps for agent runs. */
  defaultMaxSteps?: number;
  /**
   * Optional conversation store provider. When omitted an in-memory store is
   * registered. Use `useClass`/`useFactory`/`useValue` to plug a custom store.
   */
  conversationStore?: ConversationStoreProvider;
}

/**
 * Async configuration for `AiModule.forRootAsync`, allowing the options to be
 * built from injected dependencies such as `ConfigService`.
 */
export interface AiModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (
    ...args: any[]
  ) => Promise<AiModuleOptions> | AiModuleOptions;
  inject?: any[];
  /**
   * Optional conversation store provider registered alongside the async
   * options (the factory result's `conversationStore` is ignored for DI
   * reasons — declare it here instead).
   */
  conversationStore?: ConversationStoreProvider;
}

/**
 * Classes registered via `AiModule.forFeature` for convenience so users do not
 * have to wire agents/tools into their own module's `providers` array.
 */
export interface AiFeatureOptions {
  agents?: Type<any>[];
  tools?: Type<any>[];
}
