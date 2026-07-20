---
name: nestjs-ai
description: Use when building AI features in a NestJS app with @mgvdev/nestjs-ai — agents, tools, structured output, streaming, embeddings, RAG, multimodal, prompts, guardrails, orchestration, MCP, caching, fallback, tool approval, jobs, cost/budgets, rate limiting, semantic memory, content safety, reranking, evals, and testing. Triggers on mentions of @mgvdev/nestjs-ai, AiModule, @Agent, @Tool, AiAgent, or "NestJS AI".
---

# Building with @mgvdev/nestjs-ai

`@mgvdev/nestjs-ai` is a NestJS toolkit over the Vercel AI SDK (v7). It adds
DI-native decorators, a dynamic module, automatic tool discovery, and production
features (cost, rate limiting, guardrails, memory, evals).

## Golden rules

1. **Configure once** with `AiModule.forRoot()` / `forRootAsync()`. It is global.
2. **Model ids are `"provider:model"`** — e.g. `"openai:gpt-4o"`. A bare id works
   when a single provider is configured or a `defaultModel` sets the provider.
3. **Agents extend `AiAgent`** and are annotated `@Agent`. Call `.run()` / `.stream()`.
4. **Tools are `@Tool` methods on injectable providers** — they keep full DI.
5. **Register agents/tools/guardrails as providers** (or via `AiModule.forFeature`)
   so discovery finds them.
6. **Install only the provider SDKs you use** (`@ai-sdk/openai`, etc.) — they are
   optional peers. Same for `bullmq`, `pg`, `@nestjs/websockets`, `msw`.

## Minimal setup

```ts
import { Module } from '@nestjs/common';
import { AiModule } from '@mgvdev/nestjs-ai';

@Module({
  imports: [
    AiModule.forRoot({
      providers: { openai: { apiKey: process.env.OPENAI_API_KEY } },
      defaultModel: 'openai:gpt-4o',
    }),
  ],
})
export class AppModule {}
```

`forRootAsync({ imports, inject, useFactory })` builds options from
`ConfigService`.

## Tools (function calling)

```ts
import { Injectable } from '@nestjs/common';
import { Tool } from '@mgvdev/nestjs-ai';
import { z } from 'zod';

@Injectable()
export class WeatherTools {
  constructor(private readonly api: WeatherApi) {} // regular DI

  @Tool({ description: 'Get weather for a city', schema: z.object({ city: z.string() }) })
  getWeather({ city }: { city: string }) {
    return this.api.lookup(city);
  }
}
```

- `@Tool({ name?, description, schema, requiresApproval? })`. `schema` is Zod.
- `requiresApproval: true` gates the call behind the configured `ApprovalGate`.

## Agents

```ts
import { Agent, AiAgent } from '@mgvdev/nestjs-ai';

@Agent({
  model: 'openai:gpt-4o',            // or ['openai:gpt-4o', 'anthropic:claude-sonnet-4'] for fallback
  system: 'You are a helpful assistant.',
  tools: [WeatherTools],             // @Tool providers, or other @Agent classes (sub-agents)
  maxSteps: 5,
  // output: z.object({...}),        // structured output
})
export class SupportAgent extends AiAgent {}
```

Run it (inject the agent class):

```ts
const { text } = await this.support.run('Weather in Paris?');
const { object } = await this.support.run<MyType>(input);       // when `output` is set
const stream = await this.support.stream('Hi');                  // Vercel stream result
```

`AgentRunOptions`: `{ model?, system?, systemPrompt?, conversationId?, maxSteps?, schema?, temperature?, maxRetries?, recall?, abortSignal? }`.

## Register your classes

```ts
@Module({
  imports: [AiModule.forFeature({ agents: [SupportAgent], tools: [WeatherTools] })],
  providers: [WeatherApi],
})
export class SupportModule {}
```

## Feature cheat-sheet

| Need | Use |
| --- | --- |
| Conversation history | `run(input, { conversationId })` — in-memory default; TypeORM (`/typeorm`) or Prisma store |
| Structured output | `@Agent({ output })` or `run(input, { schema })` |
| Streaming to HTTP | `async chat(...) { pipeAgentStream(await agent.stream(x), res, { protocol: 'ui' }); }` |
| Streaming over WebSocket | `AgentGateway` from `@mgvdev/nestjs-ai/websocket` |
| Embeddings | `EmbeddingsService.embed` / `embedMany` |
| RAG | `RagService.ingest` / `retrieve`; stores: in-memory, `PgVectorStore`, `QdrantVectorStore`, `PineconeVectorStore` |
| Reranking | `retrieve(q, { rerank: true })` (heuristic) or a `ModelReranker` |
| Multimodal | `ImageService`, `SpeechService`, `TranscriptionService` |
| Prompts | `PromptRegistry` + `AiModule.forRoot({ prompts })`; `run(x, { systemPrompt })` |
| Events | `@OnEvent('ai.agent.run.finish')` (needs `@nestjs/event-emitter`) |
| Guardrails | `@Guardrail()` classes; `beforeRun` / `afterRun` / `onToolCall` |
| Tool approval | `@Tool({ requiresApproval: true })` + `approvalGate` option |
| Multi-agent | list `@Agent` classes in another agent's `tools` |
| MCP tools | `McpService.connect(name, client)` (bring an `@modelcontextprotocol/sdk` client) |
| Fallback / retry | model array + `maxRetries` |
| Caching | `AiModule.forRoot({ cache: InMemoryAiCache })` |
| Background jobs | `AgentJobsModule.forRoot({ connection })` (BullMQ) |
| Cost & budgets | `UsageTracker`; `AiModule.forRoot({ maxCostPerConversation })`; per-run `budget: { maxCostPerRun, maxTotalTokensPerRun, ... }` on `forRoot`/`@Agent`, hooks via `OnBudgetExceeded` or `budgetExceededHandler` |
| Rate limiting | `AiModule.forRoot({ rateLimiter })` |
| Semantic memory | `SemanticMemory.remember` / `recall`; `run(x, { recall })` |
| Content safety | `PiiRedactionGuardrail`, `createModerationGuardrail` |
| Evals | `EvalRunner.run(agent, cases, { judge })` |
| Testing | `createTestingAiModule`, `createMockModel` from `@mgvdev/nestjs-ai/testing` |

## Testing

Never call real providers in tests. Use the testing subpath:

```ts
import { createTestingAiModule, createMockModel } from '@mgvdev/nestjs-ai/testing';

const app = await createTestingAiModule({
  model: createMockModel('mocked answer'),
  providers: [SupportAgent],
});
const { text } = await app.get(SupportAgent).run('hi');
```

## Common mistakes

- Forgetting to register an agent/tool/guardrail as a provider → discovery misses it.
- Using a bare model id with multiple providers configured → prefix with `provider:`.
- Expecting MCP or a rerank model from OpenAI/Google — MCP needs an external client;
  reranking needs a rerank-capable provider (e.g. Cohere).
- Importing the TypeORM store / WebSocket gateway / testing utils from the main entry —
  they live at `@mgvdev/nestjs-ai/typeorm`, `/websocket`, `/testing`.

## Deeper docs

Full guides ship in the package under `documentation/` — read them for
configuration, each feature, and the API reference.
