import type { ModuleMetadata, Type } from '@nestjs/common';
import type { ConversationStore } from '../memory/conversation-store.interface.js';
import type { BudgetLimits } from '../usage/budget.types.js';
import type { BudgetExceededHandler } from '../usage/on-budget-exceeded.interface.js';

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
   * bare `"gpt-4o"` when a single provider is configured. An array configures a
   * fallback chain (each tried in order).
   */
  defaultModel?: string | string[];
  /** Default retry count forwarded to generate/stream calls. */
  maxRetries?: number;
  /** Default embedding model, e.g. `"openai:text-embedding-3-small"`. */
  defaultEmbeddingModel?: string;
  /** Default image model, e.g. `"openai:dall-e-3"`. */
  defaultImageModel?: string;
  /** Default speech (text-to-speech) model, e.g. `"openai:tts-1"`. */
  defaultSpeechModel?: string;
  /** Default transcription model, e.g. `"openai:whisper-1"`. */
  defaultTranscriptionModel?: string;
  /** Default maximum tool-calling steps for agent runs. */
  defaultMaxSteps?: number;
  /**
   * OpenTelemetry settings forwarded to the AI SDK's `experimental_telemetry`.
   * Requires an OTel setup in the host app to actually export spans.
   */
  telemetry?: { isEnabled?: boolean; functionId?: string };
  /** Prompt templates to register at startup. */
  prompts?: import('../prompts/prompt.types.js').PromptDefinition[];
  /** Guardrail provider classes to register (also discovered via `@Guardrail`). */
  guardrails?: import('@nestjs/common').Type<any>[];
  /** Custom vector store provider (defaults to `InMemoryVectorStore`). */
  vectorStore?: import('@nestjs/common').Type<any> | {
    useClass?: import('@nestjs/common').Type<any>;
    useFactory?: (...args: any[]) => any;
    useValue?: any;
    inject?: any[];
  };
  /**
   * Response/embedding cache. When set, resolved language models are wrapped
   * with a caching middleware and embeddings are cached.
   */
  cache?: import('@nestjs/common').Type<any> | {
    useClass?: import('@nestjs/common').Type<any>;
    useFactory?: (...args: any[]) => any;
    useValue?: any;
    inject?: any[];
  };
  /** TTL (ms) for cached generations/embeddings. Default: no expiry. */
  cacheTtlMs?: number;
  /** Per-model USD pricing (per 1M tokens) for cost tracking. */
  pricing?: import('../usage/pricing.js').PricingTable;
  /** Max accumulated USD cost per conversation before runs are blocked. */
  maxCostPerConversation?: number;
  /** Per-run USD cost and token limits. */
  budget?: BudgetLimits;
  /** Global handler invoked when a run exceeds its configured budget. */
  budgetExceededHandler?: Type<BudgetExceededHandler> | {
    useClass?: Type<BudgetExceededHandler>;
    useFactory?: (...args: any[]) => BudgetExceededHandler | Promise<BudgetExceededHandler>;
    useValue?: BudgetExceededHandler;
    inject?: any[];
  };
  /** Rate limiter for throttling agent runs. */
  rateLimiter?: import('@nestjs/common').Type<any> | {
    useClass?: import('@nestjs/common').Type<any>;
    useFactory?: (...args: any[]) => any;
    useValue?: any;
    inject?: any[];
  };
  /** Reranking model id (e.g. `"cohere:rerank-v3.5"`) for `ModelReranker`. */
  rerankingModel?: string;
  /** Approval gate for tools flagged `requiresApproval` (defaults to auto-approve). */
  approvalGate?: import('@nestjs/common').Type<any> | {
    useClass?: import('@nestjs/common').Type<any>;
    useFactory?: (...args: any[]) => any;
    useValue?: any;
    inject?: any[];
  };
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
  /** Guardrail provider classes to register for discovery. */
  guardrails?: Type<any>[];
  /** Prompt templates to register at startup. */
  prompts?: import('../prompts/prompt.types.js').PromptDefinition[];
}
