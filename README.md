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

## Installation

```bash
npm install @mgvdev/nestjs-ai ai zod
# plus the provider SDK(s) you use:
npm install @ai-sdk/openai        # and/or @ai-sdk/anthropic, @ai-sdk/google
```

`@nestjs/common`, `@nestjs/core` and `reflect-metadata` are peer dependencies
(already present in every Nest app).

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
| `ProviderRegistry` | Resolve `"provider:model"` ids to models |
| `ConversationStore`, `InMemoryConversationStore` | Conversation memory |
| `ToolRegistry` | Introspect discovered tools |

## License

MIT © Maxence Guyonvarho
