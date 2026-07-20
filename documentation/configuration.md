# Configuration

## `AiModule.forRoot(options)`

```ts
AiModule.forRoot({
  providers: {
    openai: { apiKey: '…', baseURL?: '…', headers?: {} },
    anthropic: { apiKey: '…' },
    google: { apiKey: '…' },
  },
  defaultModel: 'openai:gpt-4o',                  // string | string[] (fallback chain)
  defaultEmbeddingModel: 'openai:text-embedding-3-small',
  defaultImageModel: 'openai:dall-e-3',
  defaultSpeechModel: 'openai:tts-1',
  defaultTranscriptionModel: 'openai:whisper-1',
  defaultMaxSteps: 5,
  maxRetries: 2,

  // memory
  conversationStore: MyStore,                     // class | { useClass | useFactory | useValue }
  // rag
  vectorStore: { useFactory: () => new PgVectorStore(pool) },
  rerankingModel: 'cohere:rerank-v3.5',
  // prompts / guardrails
  prompts: [{ name: 'support', template: 'Help {{user}}.' }],
  guardrails: [MyGuardrail],
  // reliability
  cache: InMemoryAiCache,
  cacheTtlMs: 60_000,
  approvalGate: MyApprovalGate,
  rateLimiter: { useValue: new InMemoryRateLimiter({ capacity: 10, refillTokens: 10, intervalMs: 60_000 }) },
  // cost
  pricing: { 'gpt-4o': { input: 2.5, output: 10 } },
  maxCostPerConversation: 1.0,
  budget: { maxCostPerRun: 0.05, maxTotalTokensPerRun: 20_000 },  // per-run limits
  budgetExceededHandler: MyBudgetHandler,          // class | { useClass | useFactory | useValue }
  // telemetry
  telemetry: { isEnabled: true, functionId: 'my-app' },
});
```

Every field is optional. Providers you don't list are simply unavailable; their
`@ai-sdk/*` package only needs to be installed if you configure that provider.

## `AiModule.forRootAsync(options)`

Build options from injected dependencies (e.g. `ConfigService`):

```ts
AiModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    providers: { openai: { apiKey: config.getOrThrow('OPENAI_API_KEY') } },
    defaultModel: 'openai:gpt-4o',
  }),
});
```

## `AiModule.forFeature(feature)`

Convenience registration so agents/tools/guardrails don't have to be added to a
consuming module's own `providers`:

```ts
AiModule.forFeature({
  agents: [SupportAgent],
  tools: [WeatherTools],
  guardrails: [ProfanityGuard],
  prompts: [{ name: 'greeting', template: 'Hi {{name}}' }],
});
```

Discovery finds providers globally regardless of where they're registered — but
they **must** be registered somewhere (here, or in your own module `providers`).

## Model ids

- `"provider:model"` — explicit, e.g. `"openai:gpt-4o"`, `"anthropic:claude-sonnet-4"`.
- Bare `"model"` — works only when a single provider is configured, or when
  `defaultModel` carries the provider prefix.
- `string[]` — a **fallback chain**: each is tried in order (see
  [Reliability](./reliability.md)).

## Environment

AI SDK v7 requires **Node.js ≥ 22**. Provider SDKs also read their own env vars
(e.g. `OPENAI_API_KEY`) if you omit `apiKey`.
