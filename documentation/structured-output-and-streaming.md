# Structured output & streaming

## Structured output

Declare an `output` schema on the agent (or pass `schema` per call) to receive a
validated object instead of text.

```ts
@Agent({
  model: 'openai:gpt-4o',
  system: 'Extract the order details.',
  output: z.object({ product: z.string(), quantity: z.number() }),
})
export class OrderAgent extends AiAgent {}

const { object } = await orderAgent.run<{ product: string; quantity: number }>(text);
```

Per call:

```ts
const { object } = await agent.run(input, {
  schema: z.object({ sentiment: z.enum(['positive', 'neutral', 'negative']) }),
});
```

Structured-output runs use `generateObject` under the hood; the result's
`object` is validated against the schema.

## Streaming

`.stream()` returns the raw Vercel AI SDK stream result. Iterate `textStream` or
pipe it to an HTTP response.

```ts
const result = agent.stream('Tell me a story');
for await (const delta of result.textStream) {
  process.stdout.write(delta);
}
```

### Stream to an HTTP response

```ts
import { pipeAgentStream } from '@mgvdev/nestjs-ai';

@Post('chat')
chat(@Body('prompt') prompt: string, @Res() res: Response) {
  pipeAgentStream(agent.stream(prompt), res, { protocol: 'ui' }); // 'ui' | 'text'
}
```

- `'ui'` → AI SDK UI message stream (for `useChat` on the frontend).
- `'text'` → a plain text stream.

### With an interceptor

```ts
import { AgentStreamInterceptor } from '@mgvdev/nestjs-ai';

@UseInterceptors(new AgentStreamInterceptor({ protocol: 'ui' }))
@Post('chat')
chat(@Body('prompt') prompt: string) {
  return agent.stream(prompt);   // returned stream result is piped automatically
}
```

### Streaming structured objects

When the agent has an `output` schema, `.stream()` returns a `streamObject`
result — iterate `partialObjectStream` for progressive objects.

### Realtime over WebSocket

See [Background jobs & realtime](./jobs-and-realtime.md) for `AgentGateway`
(`@mgvdev/nestjs-ai/websocket`).

## Persistence during streaming

When you pass a `conversationId`, the new user turn and the model's response are
persisted on stream finish (`onFinish`), just like `run()`.
