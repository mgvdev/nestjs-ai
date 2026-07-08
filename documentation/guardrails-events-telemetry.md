# Guardrails, events & telemetry

## Guardrails

A guardrail inspects, mutates, or blocks agent runs and tool calls. Throw from
any hook to abort.

```ts
import { Guardrail, type GuardrailContext } from '@mgvdev/nestjs-ai';

@Guardrail()
export class ProfanityGuard {
  beforeRun(ctx: GuardrailContext) {
    // ctx.messages is mutable; throw to block
    if (isProfane(ctx.messages)) throw new ForbiddenException('Blocked');
  }
  afterRun(ctx: GuardrailContext, result) { /* inspect the result */ }
  onToolCall(tool: string, args: unknown) { /* veto specific tool calls */ }
}
```

Register as a provider (auto-discovered) or via
`AiModule.forRoot({ guardrails: [ProfanityGuard] })` /
`AiModule.forFeature({ guardrails })`.

Hooks run in registration order:
- `beforeRun(ctx)` — before generation; mutate `ctx.messages` or throw.
- `afterRun(ctx, result)` — after generation.
- `onToolCall(tool, args)` — before each tool executes; throw to block.

Built-in guardrails ship for cost budgets, rate limiting, PII redaction, and
moderation — see [Reliability](./reliability.md) and
[Content safety](./content-safety.md).

## Events

With `@nestjs/event-emitter` installed and `EventEmitterModule.forRoot()`
imported, the library emits lifecycle events (no-op otherwise).

```ts
import { AI_EVENTS } from '@mgvdev/nestjs-ai';

@Injectable()
export class AiListener {
  @OnEvent(AI_EVENTS.agentRunFinish)
  onFinish(payload: { agent: string; result: AgentResult }) { /* … */ }

  @OnEvent(AI_EVENTS.usage)
  onUsage(record: { model: string; cost: number; inputTokens: number }) { /* … */ }
}
```

Event names:

| Constant | Name | Payload |
| --- | --- | --- |
| `agentRunStart` | `ai.agent.run.start` | `{ agent, input, options }` |
| `agentRunFinish` | `ai.agent.run.finish` | `{ agent, result }` |
| `agentRunError` | `ai.agent.run.error` | `{ agent, error }` |
| `toolCall` | `ai.tool.call` | `{ tool, args }` |
| `toolResult` | `ai.tool.result` | `{ tool, args, result }` |
| `streamFinish` | `ai.stream.finish` | `{ agent }` |
| `usage` | `ai.usage` | `{ model, agent?, inputTokens, outputTokens, cost }` |

## Telemetry (OpenTelemetry)

Forward spans to the AI SDK's `experimental_telemetry` (requires an OTel setup in
your app):

```ts
AiModule.forRoot({ telemetry: { isEnabled: true, functionId: 'support-agent' } });
```
