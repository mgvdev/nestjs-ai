# @mgvdev/nestjs-ai — Documentation

A NestJS toolkit over the [Vercel AI SDK](https://ai-sdk.dev) (v7): DI-native
agents, tools, structured output, streaming, embeddings, RAG, multimodal,
prompts, guardrails, orchestration, MCP, and production features (cost, rate
limiting, memory, evals).

## Table of contents

1. [Getting started](./getting-started.md)
2. [Configuration](./configuration.md)
3. [Agents & tools](./agents-and-tools.md)
4. [Structured output & streaming](./structured-output-and-streaming.md)
5. [Embeddings & RAG](./embeddings-and-rag.md)
6. [Multimodal (image / speech / transcription)](./multimodal.md)
7. [Prompt registry](./prompts.md)
8. [Memory (conversation & semantic)](./memory.md)
9. [Guardrails, events & telemetry](./guardrails-events-telemetry.md)
10. [Content safety (PII & moderation)](./content-safety.md)
11. [Orchestration & MCP](./orchestration-and-mcp.md)
12. [Reliability (fallback, retry, cache, rate limit, budgets)](./reliability.md)
13. [Background jobs & realtime](./jobs-and-realtime.md)
14. [Evals & testing](./evals-and-testing.md)
15. [API reference](./api-reference.md)

## Entry points

| Import | Contents |
| --- | --- |
| `@mgvdev/nestjs-ai` | Everything except the adapters below |
| `@mgvdev/nestjs-ai/typeorm` | `TypeOrmConversationStore`, `ConversationMessageEntity` |
| `@mgvdev/nestjs-ai/websocket` | `AgentGateway` |
| `@mgvdev/nestjs-ai/testing` | `createTestingAiModule`, `createMockModel` |

## Peer dependencies

**Required:** `@nestjs/common`, `@nestjs/core`, `ai`, `zod`, `reflect-metadata`, `rxjs`.

**Optional** (install per feature): `@ai-sdk/openai` · `@ai-sdk/anthropic` ·
`@ai-sdk/google` · `@ai-sdk/cohere` (reranking) · `@nestjs/event-emitter`
(events) · `@nestjs/typeorm` + `typeorm` (TypeORM store) · `bullmq` (jobs) ·
`pg` (pgvector) · `@qdrant/js-client-rest` · `@pinecone-database/pinecone` ·
`@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io` (realtime) ·
`@modelcontextprotocol/sdk` (MCP) · `msw` (testing).
