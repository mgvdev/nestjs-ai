import 'reflect-metadata';

// Module
export { AiModule } from './ai.module.js';
export {
  AI_MODULE_OPTIONS,
  CONVERSATION_STORE,
  DEFAULT_MAX_STEPS,
} from './ai.constants.js';

// Options / interfaces
export type {
  AiModuleOptions,
  AiModuleAsyncOptions,
  AiFeatureOptions,
  ProviderConfig,
  ProvidersConfig,
  ConversationStoreProvider,
} from './interfaces/ai-module-options.interface.js';

// Core services
export { ProviderRegistry } from './core/provider-registry.js';
export { AiService } from './core/ai.service.js';

// Tools
export { Tool } from './tools/tool.decorator.js';
export type { ToolOptions, ToolMetadata } from './tools/tool.metadata.js';
export {
  ToolRegistry,
  type ToolEntry,
  type ToolRef,
} from './tools/tool.registry.js';

// Agents
export { Agent } from './agent/agent.decorator.js';
export type { AgentOptions } from './agent/agent.metadata.js';
export { AiAgent } from './agent/ai-agent.base.js';
export { AgentExecutorService } from './agent/agent-executor.service.js';
export type { AgentResult, AgentRunOptions } from './agent/agent.interface.js';

// Memory
export type { ConversationStore } from './memory/conversation-store.interface.js';
export { InMemoryConversationStore } from './memory/in-memory-conversation.store.js';

// Embeddings
export { EmbeddingsService, type EmbedOptions } from './embeddings/embeddings.service.js';

// Messages
export type { AiMessage, AiInput } from './messages/message.types.js';
export { toMessages } from './messages/message.types.js';
