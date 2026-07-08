# Reliability

Fallback models, retries, caching, rate limiting, tool approval, and cost budgets.

## Fallback models & retries

Pass a **model array** to configure a fallback chain — each model is tried in
order when the previous one throws.

```ts
@Agent({ model: ['openai:gpt-4o', 'anthropic:claude-sonnet-4'] })
export class ResilientAgent extends AiAgent {}

// or per call, plus SDK-native retries:
await agent.run(prompt, { model: ['openai:gpt-4o', 'openai:gpt-4o-mini'], maxRetries: 3 });
```

Build a composite model manually with `createFallbackModel(models, { shouldRetry })`.

## Caching

Memoize model responses (via middleware) and single embeddings.

```ts
AiModule.forRoot({
  providers: { openai: { apiKey } },
  cache: InMemoryAiCache,     // or a class/factory/value implementing AiCache
  cacheTtlMs: 60_000,
});
```

Implement `AiCache` (`get` / `set`) for Redis or another backend. Cache keys are
derived from the model id and call parameters.

## Rate limiting

Throttle runs per conversation (or `"global"`).

```ts
AiModule.forRoot({
  providers: { openai: { apiKey } },
  rateLimiter: {
    useValue: new InMemoryRateLimiter({ capacity: 10, refillTokens: 10, intervalMs: 60_000 }),
  },
});
```

A throttled run throws `RateLimitedError`. Implement `RateLimiter`
(`consume(key, cost?)`) for a distributed limiter.

## Tool approval (human-in-the-loop)

Flag a tool with `requiresApproval` and register an `ApprovalGate`.

```ts
@Tool({ description: 'Delete a record', schema: z.object({ id: z.string() }), requiresApproval: true })
deleteRecord({ id }: { id: string }) { /* … */ }

@Injectable()
class QueueApprovalGate implements ApprovalGate {
  async requestApproval({ tool, args }: ApprovalContext) {
    return askAHuman(tool, args); // resolve true to allow, false to block
  }
}

AiModule.forRoot({ providers: { openai: { apiKey } }, approvalGate: QueueApprovalGate });
```

Defaults `AutoApproveGate` / `DenyApproveGate` are provided. A denied call throws
`ToolApprovalDeniedError`.

## Cost tracking & budgets

Token usage and USD cost are tracked per conversation. Set a budget to block
runaway spend.

```ts
AiModule.forRoot({
  providers: { openai: { apiKey } },
  maxCostPerConversation: 0.5,   // blocks the next run once $0.50 is reached
  pricing: { 'gpt-4o': { input: 2.5, output: 10 } }, // override defaults ($/1M tokens)
});

// inspect anytime
const { cost, inputTokens, runs } = this.usage.totals(conversationId);
```

Listen with `@OnEvent('ai.usage')`. The budget check throws `BudgetExceededError`.
Costs use `DEFAULT_PRICING` (a small built-in table) merged with your `pricing`
overrides; unknown models cost `0`.
