# Evals & testing

## Testing

Never hit real providers in tests. Use `@mgvdev/nestjs-ai/testing` (needs the
optional peer `msw`, which `ai/test` requires).

```ts
import { createTestingAiModule, createMockModel } from '@mgvdev/nestjs-ai/testing';

it('answers', async () => {
  const app = await createTestingAiModule({
    model: createMockModel('mocked answer'),
    providers: [SupportAgent],
  });
  const { text } = await app.get(SupportAgent).run('hi');
  expect(text).toBe('mocked answer');
  await app.close();
});
```

- `createMockModel(reply | replies[])` — a mock language model; an array yields
  one reply per successive call (multi-step).
- `createEmbeddingMock(fn)` — a mock embedding model from `value => number[]`.
- `createTestingAiModule({ model, embedding, providers, imports, aiOptions })` —
  boots `AiModule` with `ProviderRegistry` overridden to serve the mocks.

To exercise tool calls or multi-step loops with full control, build a
`MockLanguageModelV3` from `ai/test` directly and pass it via
`createTestingAiModule({ model })`.

## Evals (LLM-as-judge)

`EvalRunner` runs an agent over a set of cases and scores each output.

```ts
import { EvalRunner, createLlmJudge } from '@mgvdev/nestjs-ai';

const report = await this.evals.run(
  supportAgent,
  [
    { input: 'capital of France?', expected: 'Paris' },
    { input: 'summarize X', rubric: 'accurate and concise' },
  ],
  { judge: createLlmJudge(this.ai, { scale: 5, passThreshold: 0.6 }) },
);

// report.averageScore, report.passRate, report.results[]
```

- **Default judge** (no `judge` option): substring match against `case.expected`.
- **`createLlmJudge(ai, { model?, scale?, passThreshold? })`**: an LLM scores each
  output 0..`scale` (normalized to `[0, 1]`) using the case's `rubric` / `expected`.

Each `EvalResult` has `{ name, input, output, score, passed, reasoning? }`.
`EvalReport` aggregates `averageScore` and `passRate`.
