# Agents & tools

## Tools

A tool is a method on an injectable provider, decorated with `@Tool`. It keeps
full access to injected dependencies.

```ts
@Injectable()
export class WeatherTools {
  constructor(private readonly api: WeatherApi) {}

  @Tool({
    name: 'get_weather',                 // optional; defaults to the method name
    description: 'Get the weather for a city',
    schema: z.object({ city: z.string() }),
    requiresApproval: false,             // gate behind an ApprovalGate when true
  })
  getWeather({ city }: { city: string }) {
    return this.api.lookup(city);        // return value is fed back to the model
  }
}
```

- **`schema`** is a Zod schema for the arguments; the method receives the parsed object.
- The return value (any JSON-serializable value) is returned to the model.
- Tools are discovered automatically once the class is a registered provider.

### `ToolRegistry`

Introspect discovered tools:

```ts
constructor(private readonly tools: ToolRegistry) {}
this.tools.getAll();                 // ToolEntry[]
this.tools.getByName('get_weather');
this.tools.buildToolSet([WeatherTools, 'get_weather']); // for AiService
```

## Agents

Extend `AiAgent` and annotate with `@Agent`.

```ts
@Agent({
  model: 'openai:gpt-4o',              // string | string[] (fallback)
  system: 'You are a helpful assistant.',
  tools: [WeatherTools],               // @Tool providers and/or @Agent sub-agents
  maxSteps: 5,                         // tool-calling loop bound
  output: z.object({ answer: z.string() }), // optional structured output
  budget: { maxCostPerRun: 0.05 },     // per-run limits, overriding module options
})
export class SupportAgent extends AiAgent {}
```

### Running

```ts
const { text, usage, steps, toolCalls } = await agent.run('Weather in Paris?');
const { object } = await agent.run<Shape>(input);   // when `output`/`schema` set
const stream = await agent.stream('Hi');            // Vercel stream result
```

### `AgentRunOptions`

```ts
await agent.run(input, {
  model,                       // override model / fallback chain
  system,                      // override system prompt
  systemPrompt: { name, vars, version }, // resolve from PromptRegistry
  conversationId,              // load + persist history
  maxSteps,
  schema,                      // structured output for this call
  temperature,
  maxRetries,
  recall: { query?, topK? },   // prepend semantic-memory context
  abortSignal,
});
```

`run()` returns an `AgentResult`: `{ text, object?, steps?, toolCalls?, usage?, finishReason?, messages }`.

`stream()` resolves to the raw Vercel AI SDK stream result. It applies the same
run lifecycle as `run()`: conversation history and semantic recall, pre/post
guardrails, run budgets, usage tracking, and lifecycle events.

## The raw facade — `AiService`

When you don't want an agent class:

```ts
const { text } = await this.ai.generateText({
  model: 'openai:gpt-4o',
  tools: [WeatherTools],       // tool provider classes and/or names
  prompt: 'Weather in Paris?',
});
```

`AiService` mirrors `generateText` / `streamText` / `generateObject` /
`streamObject`, resolving `model` strings and `tools` references for you.

## How the tool loop works

`run()` calls the model with the resolved tools and `stopWhen: stepCountIs(maxSteps)`.
When the model emits a tool call, the SDK executes the matching `@Tool` method on
its DI instance, feeds the result back, and continues until the model produces a
final answer or `maxSteps` is reached.
