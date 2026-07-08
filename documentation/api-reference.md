# API reference

All exports are from `@mgvdev/nestjs-ai` unless a subpath is noted.

## Module

| Export | Kind | Notes |
| --- | --- | --- |
| `AiModule` | module | `forRoot` / `forRootAsync` / `forFeature` |
| `AI_MODULE_OPTIONS` | token | injected options |
| `DEFAULT_MAX_STEPS` | const | default tool-loop bound (5) |

### Tokens

`CONVERSATION_STORE` · `VECTOR_STORE` · `AI_CACHE` · `APPROVAL_GATE` ·
`AGENT_QUEUE` · `RATE_LIMITER` · `RERANKER`.

## Agents & tools

| Export | Kind |
| --- | --- |
| `@Agent(options)` | class decorator |
| `AiAgent` | base class (`.run` / `.stream`) |
| `AgentExecutorService` | runtime |
| `@Tool(options)` | method decorator |
| `ToolRegistry` | discovered-tool registry |
| `AiService` | raw `generateText`/`streamText`/`generateObject`/`streamObject` |
| `ProviderRegistry` | model resolution |

Types: `AgentOptions`, `AgentRunOptions`, `AgentResult`, `ToolOptions`,
`ToolMetadata`, `ToolEntry`, `ToolRef`, `AiMessage`, `AiInput`, `toMessages`.

## Embeddings & RAG

| Export | Kind |
| --- | --- |
| `EmbeddingsService` | `embed` / `embedMany` |
| `RagService` | `ingest` / `retrieve` |
| `createRetrievalTool(rag, opts)` | tool factory |
| `InMemoryVectorStore` | default store |
| `PgVectorStore` | Postgres/pgvector (structural `pg` Pool) |
| `QdrantVectorStore` | Qdrant (structural client) |
| `PineconeVectorStore` | Pinecone (structural index) |
| `HeuristicReranker` / `ModelReranker` | reranking |
| `splitText(text, size, overlap)` | chunker |

Types: `VectorStore`, `VectorDocument`, `VectorQueryResult`, `VectorQueryOptions`,
`IngestItem`, `IngestOptions`, `RetrieveOptions`, `Reranker`.

## Multimodal

`ImageService` · `SpeechService` · `TranscriptionService`. Option types:
`GenerateImageOptions`, `GenerateSpeechOptions`, `TranscribeOptions`, `AudioInput`.

## Prompts

`PromptRegistry` · `interpolate(template, vars)`. Types: `PromptDefinition`,
`PromptRef`.

## Memory

`InMemoryConversationStore` · `SemanticMemory`. Interface: `ConversationStore`.
Subpath `@mgvdev/nestjs-ai/typeorm`: `TypeOrmConversationStore`,
`ConversationMessageEntity`. Main: `PrismaConversationStore`,
`PrismaConversationDelegate`.

## Guardrails, events & safety

| Export | Kind |
| --- | --- |
| `@Guardrail()` | class decorator |
| `GuardrailRegistry` | runs the chain |
| `AiEventEmitter` / `AI_EVENTS` | events |
| `PiiRedactionGuardrail` / `createPiiRedactionGuardrail` | PII |
| `redactPii` / `redactMessages` / `DEFAULT_PII_PATTERNS` | helpers |
| `createModerationGuardrail` / `ContentBlockedError` | moderation |

Types: `Guardrail` (as `GuardrailContract`), `GuardrailContext`, event payloads.

## Orchestration & MCP

`AgentRegistry` · `createAgentTool` · `McpService`. Types: `AgentEntry`,
`AgentToolOptions`, `McpClientLike`, `McpToolInfo`, `McpCallResult`.

## Reliability

| Export | Kind |
| --- | --- |
| `createFallbackModel(models, opts)` | composite model |
| `InMemoryAiCache` / `createCacheMiddleware` / `cacheKey` | caching |
| `InMemoryRateLimiter` / `RateLimitGuardrail` / `RateLimitedError` | rate limit |
| `AutoApproveGate` / `DenyApproveGate` / `ToolApprovalDeniedError` | approval |
| `UsageTracker` / `BudgetGuard` / `BudgetExceededError` | cost |
| `costOf` / `DEFAULT_PRICING` / `bareModelId` | pricing |

Interfaces: `AiCache`, `RateLimiter`, `ApprovalGate`, `ApprovalContext`. Types:
`ModelPricing`, `PricingTable`, `UsageTotals`, `UsageRecord`.

## Jobs, HTTP & realtime

| Export | Kind |
| --- | --- |
| `AgentJobsModule` / `AgentQueueService` / `AgentJobProcessor` | BullMQ |
| `pipeAgentStream` / `AgentStreamInterceptor` | HTTP/SSE |
| `streamAgentToSocket` | WebSocket helper (main entry) |
| `AgentGateway` | WebSocket gateway (`@mgvdev/nestjs-ai/websocket`) |

Types: `AgentJobData`, `QueueLike`, `AgentJobsOptions`, `PipeAgentStreamOptions`,
`SocketLike`, `AgentRunMessage`.

## Evals & testing

`EvalRunner` · `createLlmJudge` · `defaultJudge`. Types: `EvalCase`, `EvalScore`,
`EvalResult`, `EvalReport`, `Judge`, `RunnableAgent`, `JudgeAi`.

Subpath `@mgvdev/nestjs-ai/testing`: `createTestingAiModule`, `createMockModel`,
`createEmbeddingMock`.
