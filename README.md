# @mgvdev/nestjs-ai

Structured AI toolkit for **NestJS** — build agents with tools, structured
output, streaming and embeddings on top of the [Vercel AI SDK](https://ai-sdk.dev),
with first-class dependency injection.

Inspired by [Laravel AI](https://github.com/laravel/ai): a consistent,
framework-native interface over multiple providers (OpenAI, Anthropic, Google).

- 🧩 **`@Agent` / `@Tool` decorators** — agents and tools are ordinary NestJS
  providers, so they can inject repositories, services, config, anything.
- 🔧 **Automatic tool discovery** — tools are found across your app and wired to
  the model; execution runs on the DI-managed instance.
- 🧠 **Pluggable conversation memory** — a `ConversationStore` interface with an
  in-memory default; bring your own DB.
- 📦 **Structured output & streaming** — Zod-validated objects and token streams.
- 🔢 **Embeddings** — one injectable service for `embed` / `embedMany`.
- 🖼️ **Multimodal** — image generation, speech synthesis, transcription.
- 📚 **RAG** — vector store interface, in-memory impl, retrieval tool for agents.
- 📝 **Prompt registry** — named, versioned templates with interpolation.
- 🛡️ **Events & guardrails** — lifecycle events (`@OnEvent`) and blocking hooks.
- 💾 **Durable memory** — TypeORM and Prisma conversation-store adapters.

## Installation

```bash
npm install @mgvdev/nestjs-ai ai zod
# plus the provider SDK(s) you use:
npm install @ai-sdk/openai        # and/or @ai-sdk/anthropic, @ai-sdk/google
```

`@nestjs/common`, `@nestjs/core` and `reflect-metadata` are peer dependencies
(already present in every Nest app).

Optional peers, only needed for the matching feature:

```bash
npm install @nestjs/event-emitter          # events & guardrails
npm install @nestjs/typeorm typeorm         # TypeORM conversation store
```

## Configuration

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiModule } from '@mgvdev/nestjs-ai';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AiModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        providers: {
          openai: { apiKey: config.getOrThrow('OPENAI_API_KEY') },
        },
        defaultModel: 'openai:gpt-4o',
        defaultEmbeddingModel: 'openai:text-embedding-3-small',
      }),
    }),
  ],
})
export class AppModule {}
```

`AiModule.forRoot(options)` is available for static configuration. The module is
global, so agents/tools/services are injectable everywhere.

Model ids are `"provider:model"` (e.g. `"openai:gpt-4o"`). A bare `"gpt-4o"`
works when a single provider is configured or a `defaultModel` sets the provider.

## Tools

Declare tools as methods on an injectable provider. The Zod `schema` types the
arguments; the return value is fed back to the model.

```ts
import { Injectable } from '@nestjs/common';
import { Tool } from '@mgvdev/nestjs-ai';
import { z } from 'zod';

@Injectable()
export class WeatherTools {
  constructor(private readonly weather: WeatherApi) {} // regular DI

  @Tool({
    description: 'Get the current weather for a city',
    schema: z.object({ city: z.string() }),
  })
  getWeather({ city }: { city: string }) {
    return this.weather.lookup(city); // uses the injected dependency
  }
}
```

## Agents

Extend `AiAgent` and annotate with `@Agent`. Reference tool provider classes in
`tools`.

```ts
import { Agent, AiAgent } from '@mgvdev/nestjs-ai';

@Agent({
  model: 'openai:gpt-4o',
  system: 'You are a helpful weather assistant.',
  tools: [WeatherTools],
  maxSteps: 5,
})
export class WeatherAgent extends AiAgent {}
```

Register the classes (or use `AiModule.forFeature`):

```ts
@Module({
  imports: [AiModule.forFeature({ agents: [WeatherAgent], tools: [WeatherTools] })],
  providers: [WeatherApi],
})
export class WeatherModule {}
```

Run it:

```ts
@Injectable()
export class ChatService {
  constructor(private readonly agent: WeatherAgent) {}

  async ask(question: string) {
    const { text } = await this.agent.run(question);
    return text;
  }
}
```

### Conversation memory

Pass a `conversationId` to load prior turns and persist the new exchange:

```ts
await this.agent.run('What about tomorrow?', { conversationId: user.id });
```

The default store is in-memory. Provide your own by implementing
`ConversationStore` and passing it to `AiModule.forRoot({ conversationStore })`.

### Structured output

Declare an `output` schema on the agent (or pass `schema` per call) to get a
validated object instead of text:

```ts
@Agent({
  model: 'openai:gpt-4o',
  system: 'Extract the order details.',
  output: z.object({ product: z.string(), quantity: z.number() }),
})
export class OrderAgent extends AiAgent {}

const { object } = await orderAgent.run<{ product: string; quantity: number }>(text);
```

### Streaming

`.stream()` returns the raw Vercel AI SDK stream result, so you can pipe it to an
HTTP response or iterate `textStream`:

```ts
@Controller('chat')
export class ChatController {
  constructor(private readonly agent: WeatherAgent) {}

  @Post()
  stream(@Body('prompt') prompt: string, @Res() res: Response) {
    const result = this.agent.stream(prompt);
    result.pipeUIMessageStreamToResponse(res);
  }
}
```

## Embeddings

```ts
import { EmbeddingsService } from '@mgvdev/nestjs-ai';

@Injectable()
export class SearchService {
  constructor(private readonly embeddings: EmbeddingsService) {}

  async index(docs: string[]) {
    const { embeddings } = await this.embeddings.embedMany(docs);
    return embeddings;
  }
}
```

## Multimodal

`ImageService`, `SpeechService`, and `TranscriptionService` wrap the SDK's
image/speech/transcription APIs. Set `defaultImageModel` / `defaultSpeechModel` /
`defaultTranscriptionModel` in options, or pass `model` per call.

```ts
const { image } = await this.images.generate('a fox in the snow', { size: '1024x1024' });
const { audio } = await this.speech.generate('Hello there', { model: 'openai:tts-1', voice: 'alloy' });
const { text } = await this.transcription.transcribe(buffer, { model: 'openai:whisper-1' });
```

## RAG (retrieval-augmented generation)

Ingest documents (chunked + embedded) into a `VectorStore`, then retrieve the
most relevant chunks. The default store is `InMemoryVectorStore`
(cosine similarity); override `vectorStore` in options for pgvector etc.

```ts
import { RagService, createRetrievalTool } from '@mgvdev/nestjs-ai';

await this.rag.ingest([
  { id: 'doc1', content: longText, metadata: { source: 'handbook' } },
]);
const hits = await this.rag.retrieve('vacation policy', { topK: 4 });
```

Expose retrieval to an agent as a tool — either a `@Tool` method that calls
`RagService`, or the `createRetrievalTool` factory:

```ts
@Injectable()
class KnowledgeTools {
  constructor(private readonly rag: RagService) {}

  @Tool({ description: 'Search the handbook', schema: z.object({ query: z.string() }) })
  async search({ query }: { query: string }) {
    const hits = await this.rag.retrieve(query);
    return hits.map((h) => h.content).join('\n\n');
  }
}
```

## Prompt registry

Register named, versioned templates and render them with `{{var}}` interpolation.

```ts
AiModule.forRoot({
  prompts: [
    { name: 'support', version: 'v1', template: 'Help {{user}} with {{topic}}.' },
  ],
});

// render directly…
const system = this.prompts.render('support', { user: 'Ada', topic: 'billing' });
// …or resolve an agent's system prompt per call:
await agent.run(question, { systemPrompt: { name: 'support', vars: { user, topic } } });
```

## Events & guardrails

With `@nestjs/event-emitter` installed and `EventEmitterModule.forRoot()`
imported, the library emits lifecycle events (no-op otherwise):

```ts
import { AI_EVENTS } from '@mgvdev/nestjs-ai';

@Injectable()
class AiListener {
  @OnEvent(AI_EVENTS.agentRunFinish)
  onFinish(payload: { agent: string; result: AgentResult }) {
    // log usage, persist traces, …
  }
}
```

Events: `ai.agent.run.start|finish|error`, `ai.tool.call|result`, `ai.stream.finish`.

Guardrails inspect, mutate, or block runs and tool calls. Throw to abort:

```ts
import { Guardrail, type GuardrailContext } from '@mgvdev/nestjs-ai';

@Guardrail()
export class ProfanityGuard {
  beforeRun(ctx: GuardrailContext) {
    if (isProfane(ctx.messages)) throw new ForbiddenException('Blocked');
  }
  onToolCall(tool: string, args: unknown) {
    // veto specific tool calls
  }
}
```

Register guardrails as providers (auto-discovered) or via
`AiModule.forRoot({ guardrails: [ProfanityGuard] })`.

## Telemetry

Forward OpenTelemetry spans to the AI SDK by enabling telemetry (requires an OTel
setup in your app):

```ts
AiModule.forRoot({ telemetry: { isEnabled: true, functionId: 'support-agent' } });
```

## Persistent conversation stores

The in-memory store is the default. For durable history:

**TypeORM** (subpath `@mgvdev/nestjs-ai/typeorm`, needs `typeorm` + `@nestjs/typeorm`):

```ts
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import {
  ConversationMessageEntity,
  TypeOrmConversationStore,
} from '@mgvdev/nestjs-ai/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationMessageEntity]),
    AiModule.forRoot({
      providers: { openai: { apiKey: process.env.OPENAI_API_KEY } },
      conversationStore: {
        useFactory: (repo) => new TypeOrmConversationStore(repo),
        inject: [getRepositoryToken(ConversationMessageEntity)],
      },
    }),
  ],
})
export class AppModule {}
```

**Prisma** (no build-time dependency — pass a model delegate):

```ts
import { PrismaConversationStore } from '@mgvdev/nestjs-ai';

AiModule.forRoot({
  conversationStore: {
    useFactory: (prisma: PrismaService) => new PrismaConversationStore(prisma.aiMessage),
    inject: [PrismaService],
  },
});
```

```prisma
model AiMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String
  content        Json
  position       Int
  createdAt      DateTime @default(now())
  @@index([conversationId])
}
```

## Raw generation (no agent class)

`AiService` is a thin, DI-friendly facade over the SDK when you don't want an
agent class. It resolves `model` strings and `tools` references:

```ts
import { AiService } from '@mgvdev/nestjs-ai';

const { text } = await this.ai.generateText({
  model: 'openai:gpt-4o',
  tools: [WeatherTools],
  prompt: 'Weather in Paris?',
});
```

## API surface

| Export | Purpose |
| --- | --- |
| `AiModule` | `forRoot` / `forRootAsync` / `forFeature` |
| `@Agent`, `AiAgent` | Declare and run agents (`.run` / `.stream`) |
| `@Tool` | Declare a tool method on a provider |
| `AiService` | Raw `generateText` / `streamText` / `generateObject` / `streamObject` |
| `EmbeddingsService` | `embed` / `embedMany` |
| `ImageService`, `SpeechService`, `TranscriptionService` | Multimodal generation |
| `RagService`, `VectorStore`, `InMemoryVectorStore`, `createRetrievalTool` | RAG |
| `PromptRegistry` | Named, versioned prompt templates |
| `@Guardrail`, `GuardrailRegistry`, `AiEventEmitter`, `AI_EVENTS` | Events & guardrails |
| `ProviderRegistry` | Resolve `"provider:model"` ids to models |
| `ConversationStore`, `InMemoryConversationStore` | Conversation memory |
| `TypeOrmConversationStore` (`/typeorm`), `PrismaConversationStore` | Durable memory |
| `ToolRegistry` | Introspect discovered tools |

## License

MIT © Maxence Guyonvarho
