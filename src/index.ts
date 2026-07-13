import 'reflect-metadata';

// Module
export { AiModule } from './ai.module.js';
export {
  AI_MODULE_OPTIONS,
  CONVERSATION_STORE,
  VECTOR_STORE,
  AI_CACHE,
  APPROVAL_GATE,
  AGENT_QUEUE,
  RATE_LIMITER,
  RERANKER,
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

// Multimodal
export { ImageService, type GenerateImageOptions } from './multimodal/image.service.js';
export { SpeechService, type GenerateSpeechOptions } from './multimodal/speech.service.js';
export {
  TranscriptionService,
  type TranscribeOptions,
  type AudioInput,
} from './multimodal/transcription.service.js';

// RAG / vector store
export type {
  VectorStore,
  VectorDocument,
  VectorQueryResult,
  VectorQueryOptions,
} from './rag/vector-store.interface.js';
export { InMemoryVectorStore } from './rag/in-memory-vector-store.js';
export {
  RagService,
  splitText,
  type IngestItem,
  type IngestOptions,
  type RetrieveOptions,
} from './rag/rag.service.js';
export {
  createRetrievalTool,
  type RetrievalToolOptions,
} from './rag/retrieval-tool.js';

// Prompts
export { PromptRegistry } from './prompts/prompt-registry.service.js';
export {
  interpolate,
  type PromptDefinition,
  type PromptRef,
} from './prompts/prompt.types.js';

// Observability
export {
  AiEventEmitter,
  EVENT_EMITTER,
  type EventEmitterLike,
} from './observability/ai-event-emitter.js';
export { AI_EVENTS } from './observability/ai-events.js';
export type {
  AgentRunStartPayload,
  AgentRunFinishPayload,
  AgentRunErrorPayload,
  ToolCallPayload,
  ToolResultPayload,
} from './observability/ai-events.js';
export { Guardrail } from './observability/guardrail.decorator.js';
export { GuardrailRegistry } from './observability/guardrail.registry.js';
export type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from './observability/guardrail.interface.js';

// Conversation store adapters
// NOTE: the TypeORM adapter runtime-imports `typeorm` (an optional peer), so it
// is published under the `@mgvdev/nestjs-ai/typeorm` subpath instead of here.
// The Prisma adapter has no runtime dependency and is safe to export directly.
export {
  PrismaConversationStore,
  type PrismaConversationDelegate,
} from './memory/adapters/prisma/prisma-conversation.store.js';

// Resilience (fallback + retry)
export {
  createFallbackModel,
  type FallbackOptions,
} from './resilience/fallback-model.js';

// Caching
export type { AiCache } from './cache/ai-cache.interface.js';
export { InMemoryAiCache } from './cache/in-memory-ai-cache.js';
export {
  createCacheMiddleware,
  cacheKey,
  type CacheMiddlewareOptions,
} from './cache/cache-middleware.js';

// Approval (human-in-the-loop)
export {
  type ApprovalGate,
  type ApprovalContext,
  ToolApprovalDeniedError,
} from './approval/approval-gate.interface.js';
export { AutoApproveGate, DenyApproveGate } from './approval/approval-gates.js';

// Multi-agent orchestration
export {
  AgentRegistry,
  type AgentEntry,
} from './agent/orchestration/agent-registry.js';
export {
  createAgentTool,
  type AgentToolOptions,
} from './agent/orchestration/agent-tool.js';

// HTTP / SSE helpers
export {
  pipeAgentStream,
  type PipeAgentStreamOptions,
  type PipeableStreamResult,
} from './http/stream-response.js';
export { AgentStreamInterceptor } from './http/agent-stream.interceptor.js';

// MCP (bring your own @modelcontextprotocol/sdk client)
export {
  McpService,
  type McpClientLike,
  type McpToolInfo,
  type McpCallResult,
} from './mcp/mcp.service.js';

// Background jobs (requires optional peer `bullmq`)
export { AgentJobsModule, type AgentJobsOptions } from './jobs/agent-jobs.module.js';
export { AgentQueueService, AGENT_JOB_NAME } from './jobs/agent-queue.service.js';
export { AgentJobProcessor } from './jobs/agent-job.processor.js';
export type { AgentJobData, QueueLike } from './jobs/agent-job.types.js';

// pgvector store (pass your own `pg` Pool)
export {
  PgVectorStore,
  type PgPoolLike,
  type PgVectorStoreOptions,
} from './rag/adapters/pgvector/pgvector-store.js';

// Cost & usage
export {
  DEFAULT_PRICING,
  costOf,
  bareModelId,
  type ModelPricing,
  type PricingTable,
} from './usage/pricing.js';
export {
  UsageTracker,
  type UsageTotals,
  type UsageRecord,
} from './usage/usage-tracker.service.js';
export { BudgetGuard, BudgetExceededError } from './usage/budget.guardrail.js';
export { BudgetPolicy } from './usage/budget-policy.service.js';
export { RunBudgetGuardrail } from './usage/run-budget.guardrail.js';
export { RunBudgetExceededError } from './usage/run-budget-exceeded.error.js';
export type {
  BudgetLimits,
  BudgetExceededKind,
  BudgetCheckContext,
  BudgetRunContext,
  BudgetExceededContext,
  BudgetDecision,
} from './usage/budget.types.js';
export type {
  OnBudgetExceeded,
  BudgetExceededHandler,
} from './usage/on-budget-exceeded.interface.js';
export { BUDGET_EXCEEDED_HANDLER } from './usage/on-budget-exceeded.interface.js';

// Rate limiting
export {
  type RateLimiter,
  RateLimitedError,
} from './ratelimit/rate-limiter.interface.js';
export {
  InMemoryRateLimiter,
  type InMemoryRateLimiterOptions,
} from './ratelimit/in-memory-rate-limiter.js';
export { RateLimitGuardrail } from './ratelimit/rate-limit.guardrail.js';

// Content safety
export {
  PiiRedactionGuardrail,
  createPiiRedactionGuardrail,
  redactPii,
  redactMessages,
  DEFAULT_PII_PATTERNS,
  type PiiRedactionOptions,
} from './safety/pii-redaction.guardrail.js';
export {
  createModerationGuardrail,
  ContentBlockedError,
  type ModerationOptions,
} from './safety/moderation.guardrail.js';

// Semantic memory
export {
  SemanticMemory,
  type RecallOptions,
} from './memory/semantic/semantic-memory.service.js';

// Reranking
export type { Reranker } from './rag/rerank/reranker.interface.js';
export {
  HeuristicReranker,
  type HeuristicRerankerOptions,
} from './rag/rerank/heuristic-reranker.js';
export { ModelReranker } from './rag/rerank/model-reranker.js';

// Vector adapters (pass your own client)
export {
  QdrantVectorStore,
  type QdrantClientLike,
  type QdrantVectorStoreOptions,
} from './rag/adapters/qdrant/qdrant-vector-store.js';
export {
  PineconeVectorStore,
  type PineconeIndexLike,
} from './rag/adapters/pinecone/pinecone-vector-store.js';

// Evals
export {
  EvalRunner,
  createLlmJudge,
  defaultJudge,
  type RunnableAgent,
  type JudgeAi,
  type RunEvalOptions,
} from './evals/eval-runner.service.js';
export type {
  EvalCase,
  EvalScore,
  EvalResult,
  EvalReport,
  Judge,
} from './evals/eval.types.js';

// WebSocket streaming helper (the gateway itself is at /websocket)
export {
  streamAgentToSocket,
  type SocketLike,
  type TextStreamLike,
  type StreamToSocketOptions,
} from './websocket/stream-to-socket.js';
