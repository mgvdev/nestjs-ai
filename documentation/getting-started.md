# Getting started

## Install

```bash
npm install @mgvdev/nestjs-ai ai zod
npm install @ai-sdk/openai         # and/or @ai-sdk/anthropic, @ai-sdk/google
```

`@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs` are already in
every Nest app. Ensure `reflect-metadata` is imported once at your app entry.

## Register the module

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

`AiModule` is global — its services are injectable everywhere.

## Your first agent

```ts
// support.agent.ts
import { Agent, AiAgent } from '@mgvdev/nestjs-ai';

@Agent({ model: 'openai:gpt-4o', system: 'You are a concise assistant.' })
export class SupportAgent extends AiAgent {}
```

```ts
// support.module.ts
import { Module } from '@nestjs/common';
import { AiModule } from '@mgvdev/nestjs-ai';
import { SupportAgent } from './support.agent';

@Module({ imports: [AiModule.forFeature({ agents: [SupportAgent] })] })
export class SupportModule {}
```

```ts
// support.service.ts
import { Injectable } from '@nestjs/common';
import { SupportAgent } from './support.agent';

@Injectable()
export class SupportService {
  constructor(private readonly agent: SupportAgent) {}

  ask(question: string) {
    return this.agent.run(question).then((r) => r.text);
  }
}
```

## Add a tool

```ts
import { Injectable } from '@nestjs/common';
import { Tool } from '@mgvdev/nestjs-ai';
import { z } from 'zod';

@Injectable()
export class ClockTools {
  @Tool({ description: 'Get the current time', schema: z.object({}) })
  now() {
    return new Date().toISOString();
  }
}
```

Reference it on the agent and register both:

```ts
@Agent({ model: 'openai:gpt-4o', system: '…', tools: [ClockTools] })
export class SupportAgent extends AiAgent {}

AiModule.forFeature({ agents: [SupportAgent], tools: [ClockTools] });
```

## Next

- [Configuration](./configuration.md) — providers, defaults, async config.
- [Agents & tools](./agents-and-tools.md) — the full agent/tool model.
- [Evals & testing](./evals-and-testing.md) — test without hitting providers.
