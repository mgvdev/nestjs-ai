# Background jobs & realtime

## Background jobs (BullMQ)

Run agents asynchronously. `AgentJobsModule` is a separate module (not part of
the global `AiModule`); it needs the optional peer `bullmq` and a Redis instance.

```ts
import { AgentJobsModule } from '@mgvdev/nestjs-ai';

@Module({
  imports: [
    AgentJobsModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
      queueName: 'ai-agent-runs',   // optional
      runWorker: true,               // start a worker in this process (default)
    }),
  ],
})
export class JobsModule {}
```

Enqueue a run:

```ts
constructor(private readonly queue: AgentQueueService) {}

const jobId = await this.queue.enqueue({
  agent: 'SupportAgent',     // agent class name (resolved via AgentRegistry)
  input: 'summarize ticket 42',
  options: { conversationId: 't-42' },
});
```

The worker resolves the agent from `AgentRegistry`, runs it, and returns the
`AgentResult` as the job's return value (BullMQ stores it). Query status via the
BullMQ job API.

For fine control, inject `AgentJobProcessor` and call `run(data)` yourself from a
custom worker.

## Realtime (WebSocket)

Stream agent responses over socket.io. From `@mgvdev/nestjs-ai/websocket` (needs
`@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`).

```ts
import { AgentGateway } from '@mgvdev/nestjs-ai/websocket';

@Module({ providers: [AgentGateway] })
export class RealtimeModule {}
```

Protocol:
- Client emits `agent:run` `{ agent, input }`.
- Server streams `agent:chunk` `{ delta }` per token, then `agent:done` `{ text }`.
- Errors arrive as `agent:error` `{ message }`.

```js
socket.emit('agent:run', { agent: 'ChatAgent', input: 'Hello' });
socket.on('agent:chunk', ({ delta }) => append(delta));
socket.on('agent:done', ({ text }) => finalize(text));
```

### Framework-agnostic helper

`streamAgentToSocket(streamResult, socket, options?)` (from the main entry)
forwards a stream to any object with an `emit` method — use it to build your own
gateway or adapter.
