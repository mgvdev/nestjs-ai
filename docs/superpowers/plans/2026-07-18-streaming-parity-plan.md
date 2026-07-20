# Streaming Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AiAgent.stream()` apply the same conversation, memory, guardrail, budget, usage, and lifecycle-event behavior as `AiAgent.run()`.

**Architecture:** Move the common asynchronous preparation currently embedded in `AgentExecutorService.run()` into a shared private preparation path. Make `stream()` asynchronous so preparation completes before an AI SDK stream is created, then adapt each stream completion callback into an `AgentResult` and send it through one shared finalization path. The public streaming API therefore changes from returning a stream immediately to resolving one with `await`.

**Tech Stack:** TypeScript 5.6, NestJS 10/11, Vercel AI SDK 7, Vitest 2.

## Global Constraints

- Treat this as a breaking public-API change: every `agent.stream(input)` consumer must await the returned promise before reading or piping the result.
- Keep the raw Vercel AI SDK stream result as the resolved value; do not introduce a wrapper stream type.
- Preserve the current `AgentRunOptions` interface and the existing `run()` behavior.
- Do not add a live, mid-stream budget cutoff: this work only makes streaming match the existing post-completion run-budget policy.
- Run every new behavioral test red before production changes, then run the focused suite, typecheck, build, and full test suite.

---

## File Map

- Modify: `src/agent/agent-executor.service.ts` — share preparation/finalization and make streaming lifecycle-complete.
- Modify: `src/agent/ai-agent.base.ts` — expose the promise-based `stream()` return type.
- Modify: `src/agent/agent-executor.spec.ts` — prove parity for text streaming, including preflight and completion behavior.
- Modify: `src/integration.spec.ts` — cover streaming with registered guardrails and lifecycle events in a Nest module.
- Modify: `src/websocket/agent.gateway.ts` — await the stream before forwarding it to the socket helper.
- Modify: `README.md` — migrate public HTTP/SSE examples to `await agent.stream(...)`.
- Modify: `documentation/agents-and-tools.md` — document the asynchronous streaming call.
- Modify: `documentation/structured-output-and-streaming.md` — document the new call shape and parity guarantees.

## Behavioral Contract

1. `await agent.stream(input, options)` must load conversation history, resolve requested semantic recall, build a mutable guardrail context, emit `ai.agent.run.start`, run `beforeRun` guardrails, and call `beforeRunBudget` before invoking the provider.
2. Preflight guardrails and budget hooks may mutate/block exactly as in `run()`. If they throw, no provider stream is opened, `ai.agent.run.error` is emitted, and the returned promise rejects.
3. After a text stream finishes, the library must persist the exchange, record aggregate usage, invoke `afterRunBudget`, run `afterRun` guardrails (including `RunBudgetGuardrail`), emit `ai.agent.run.finish`, then emit `ai.stream.finish`.
4. Structured-object streams must use the same completion pipeline with an `AgentResult` containing `object`, `usage`, and the persisted JSON assistant message. Do not persist an undefined object.
5. A provider/stream failure emits `ai.agent.run.error` once and does not emit either success event or persist a partial assistant response.

### Task 1: Lock down asynchronous preflight behavior

**Files:**
- Modify: `src/agent/agent-executor.spec.ts`
- Modify: `src/agent/agent-executor.service.ts`
- Modify: `src/agent/ai-agent.base.ts`

**Interfaces:**
- Consumes: `AgentRunOptions`, `ConversationStore`, `SemanticMemory`, `GuardrailRegistry`, and `BudgetPolicy`.
- Produces: `AiAgent.stream(input, options): Promise<ReturnType<AgentExecutorService['stream']>>` and one private `prepareRun(...)` helper used by both execution modes.

- [ ] **Step 1: Write failing stream-preflight tests**

  Add a `RecordingGuardrail` test provider whose `beforeRun` appends a known system message to `ctx.messages`, tracks calls, and can throw. Add a `beforeRunBudget` agent hook that can block. Extend the mock streaming model to retain `doStreamCalls`.

  ```ts
  it('loads history and runs before hooks before opening a text stream', async () => {
    currentModel = streamingModel('ok');
    const moduleRef = await bootstrapWith({ guardrails: [RecordingGuardrail] });
    const agent = moduleRef.get(WeatherAgent);
    const store = moduleRef.get<ConversationStore>(CONVERSATION_STORE);
    await store.append('conv-1', [{ role: 'user', content: 'Earlier turn' }]);

    const result = await agent.stream('Current turn', { conversationId: 'conv-1' });
    await drain(result.textStream);

    expect((currentModel as MockLanguageModelV3).doStreamCalls[0].prompt)
      .toContainEqual(expect.objectContaining({ role: 'user', content: 'Earlier turn' }));
    expect(moduleRef.get(RecordingGuardrail).before).toBe(1);
    await moduleRef.close();
  });

  it('rejects before opening a stream when a preflight hook blocks', async () => {
    currentModel = streamingModel('never reached');
    const moduleRef = await bootstrapWith({ providers: [BlockingBudgetAgent] });

    await expect(moduleRef.get(BlockingBudgetAgent).stream('blocked'))
      .rejects.toThrow('no-credits-left');
    expect((currentModel as MockLanguageModelV3).doStreamCalls).toHaveLength(0);
    await moduleRef.close();
  });
  ```

- [ ] **Step 2: Run the focused tests and confirm they fail for the current synchronous API**

  Run: `npm test -- src/agent/agent-executor.spec.ts`

  Expected: FAIL because `agent.stream(...)` is not a promise and the first provider prompt does not include stored history or a guardrail mutation.

- [ ] **Step 3: Extract shared preparation and make streaming asynchronous**

  In `src/agent/agent-executor.service.ts`, add a private `prepareRun(agent, input, opts)` method returning the resolved model, metadata, prepared system prompt, `newMessages`, and `GuardrailContext`. Its order must match the current `run()` method:

  ```ts
  const history = await this.loadHistory(opts.conversationId);
  const system = await this.resolveSystemWithRecall(opts, meta, input);
  const ctx: GuardrailContext = {
    agent: agentName,
    agentInstance: agent,
    messages: [...history, ...newMessages],
    options: opts,
  };
  this.events?.emit(AI_EVENTS.agentRunStart, { agent: agentName, input, options: opts });
  await this.guardrails?.runBeforeRun(ctx);
  await this.budgetPolicy?.beforeRunBudget(agent, ctx);
  ```

  Refactor `run()` to use that helper without changing its output. Change `AgentExecutorService.stream()` to `async`, await the helper inside `try/catch`, and use `ctx.messages` rather than only `newMessages` in both `streamText` and `streamObject`. On preparation failure emit `AI_EVENTS.agentRunError` with the same payload shape as `run()` and rethrow.

  In `src/agent/ai-agent.base.ts`, make the delegation async and return the executor promise:

  ```ts
  stream(input: AiInput, opts?: AgentRunOptions) {
    return this.executor.stream(this, input, opts);
  }
  ```

  Update the `stream()` doc comment to state that callers must await the raw AI SDK stream result.

- [ ] **Step 4: Run the focused tests and typecheck**

  Run: `npm test -- src/agent/agent-executor.spec.ts && npm run typecheck`

  Expected: PASS. Existing stream callers will now produce type errors and are intentionally migrated in Task 3.

- [ ] **Step 5: Commit the isolated API and preflight change**

  ```bash
  git add src/agent/agent-executor.service.ts src/agent/ai-agent.base.ts src/agent/agent-executor.spec.ts
  git commit -m "feat: apply streaming preflight checks"
  ```

### Task 2: Finalize streams through the run lifecycle

**Files:**
- Modify: `src/agent/agent-executor.service.ts`
- Modify: `src/agent/agent-executor.spec.ts`
- Modify: `src/integration.spec.ts`

**Interfaces:**
- Consumes: a prepared `GuardrailContext`, model id, `AiMessage[]`, and AI SDK `onFinish` events.
- Produces: a private `completeRun(agent, ctx, result, newMessages, responseMessages?)` helper that persists, records usage, runs post-hooks, and emits success events in the defined order.

- [ ] **Step 1: Write failing completion-parity tests**

  Add text-stream tests that fully consume `textStream`, then assert the persisted conversation, the `UsageTracker` total, guardrail counts, budget post-hook count, and event order. Add an integration test with `EventEmitterModule.forRoot()` and `RunCounter`.

  ```ts
  it('finalizes a consumed text stream like run()', async () => {
    currentModel = streamingModel('Hello world', USAGE);
    const moduleRef = await bootstrapWithEventsAndGuardrail();
    const agent = moduleRef.get(WeatherAgent);
    const usage = moduleRef.get(UsageTracker);
    const events: string[] = [];
    moduleRef.get(EventEmitter2).on(AI_EVENTS.agentRunFinish, () => events.push('run'));
    moduleRef.get(EventEmitter2).on(AI_EVENTS.streamFinish, () => events.push('stream'));

    const result = await agent.stream('Hi', { conversationId: 'conv-1' });
    await drain(result.textStream);

    expect(usage.totals('conv-1').inputTokens).toBe(USAGE.inputTokens);
    expect(moduleRef.get(RunCounter)).toMatchObject({ before: 1, after: 1 });
    expect(await moduleRef.get<ConversationStore>(CONVERSATION_STORE).load('conv-1'))
      .toHaveLength(2);
    expect(events).toEqual(['run', 'stream']);
    await moduleRef.close();
  });
  ```

  Add a structured-output streaming test that consumes `partialObjectStream`, asserts the JSON assistant message is persisted, and confirms usage/post-hooks run. Add an error-stream test that asserts `ai.agent.run.error` fires once and no success event or assistant message is written.

- [ ] **Step 2: Run the focused tests and confirm completion gaps**

  Run: `npm test -- src/agent/agent-executor.spec.ts src/integration.spec.ts`

  Expected: FAIL because streams only persist today; they do not record usage, call post-run hooks, emit `ai.agent.run.finish`, or report stream errors.

- [ ] **Step 3: Implement one guarded stream-completion path**

  Add `completeRun(...)` alongside `persist(...)`. It must execute the same successful finalization order as `run()`:

  ```ts
  await this.persist(conversationId, newMessages, responseMessages);
  this.usageTracker?.record({ model, usage: result.usage, conversationId, agent: ctx.agent });
  await this.budgetPolicy?.afterRunBudget(agent, ctx, result);
  await this.guardrails?.runAfterRun(ctx, result);
  this.events?.emit(AI_EVENTS.agentRunFinish, { agent: ctx.agent, result });
  this.events?.emit(AI_EVENTS.streamFinish, { agent: ctx.agent });
  ```

  In the text `onFinish`, map the SDK event into `AgentResult` using its aggregate `usage`, `finishReason`, `steps`, `toolCalls`, `text`, and generated response messages, then call `completeRun`. In the object `onFinish`, report one run error and skip completion/persistence when `object` is undefined; otherwise map `{ text: '', object, usage, messages: [] }` and persist `JSON.stringify(object)` as the assistant message.

  Register `onError` for both stream kinds. Use a per-stream `reportErrorOnce` closure so failures from the SDK callback, persistence, or post-run hooks emit exactly one `AI_EVENTS.agentRunError` payload and never success events. Preserve the raw SDK result: do not rethrow completion-callback failures or wrap the stream; consumers observe those failures through `AI_EVENTS.agentRunError` only.

- [ ] **Step 4: Run focused parity tests, then the package suite**

  Run: `npm test -- src/agent/agent-executor.spec.ts src/integration.spec.ts && npm test`

  Expected: PASS, including existing `run()` integration tests and all non-streaming suites.

- [ ] **Step 5: Commit completion behavior and regression tests**

  ```bash
  git add src/agent/agent-executor.service.ts src/agent/agent-executor.spec.ts src/integration.spec.ts
  git commit -m "feat: finalize streams with run lifecycle"
  ```

### Task 3: Migrate internal consumers and public documentation

**Files:**
- Modify: `src/websocket/agent.gateway.ts`
- Modify: `README.md`
- Modify: `documentation/agents-and-tools.md`
- Modify: `documentation/structured-output-and-streaming.md`

**Interfaces:**
- Consumes: `AiAgent.stream(): Promise<StreamTextResult | StreamObjectResult>`.
- Produces: all examples and framework adapters await a resolved AI SDK stream before using it.

- [ ] **Step 1: Write/update failing type-level usage coverage**

  Update the existing `streams text chunks` test to await the call:

  ```ts
  const result = await agent.stream('Hi');
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  ```

  Update the WebSocket gateway call site to the intended usage in its test setup or add a narrow gateway test if no regression test exists:

  ```ts
  await streamAgentToSocket(await agent.stream(message.input), client);
  ```

- [ ] **Step 2: Verify the migration fails before adapting all call sites**

  Run: `npm run typecheck`

  Expected: FAIL at every remaining direct `agent.stream(...)` consumer that treats the promise as a stream result.

- [ ] **Step 3: Update consumers and every documented call site**

  Make `AgentGateway.run()` await `agent.stream(message.input)` before passing it to `streamAgentToSocket`.

  In `README.md` and `documentation/structured-output-and-streaming.md`, use an `async` Nest controller method and await before piping:

  ```ts
  @Post('chat')
  async chat(@Body('prompt') prompt: string, @Res() res: Response) {
    pipeAgentStream(await this.agent.stream(prompt), res, { protocol: 'ui' });
  }
  ```

  Keep interceptor examples promise-returning (`return this.agent.stream(prompt)`) because Nest resolves handler promises before `AgentStreamInterceptor` receives the value. Change prose from “returns the raw stream result” to “resolves to the raw stream result.” Document that semantic recall, conversations, pre/post guardrails, run budgets, usage tracking, and lifecycle events now behave as they do for `run()`.

- [ ] **Step 4: Run final verification**

  Run: `npm run typecheck && npm test && npm run build`

  Expected: all commands exit 0 and the generated declarations show `stream()` as promise-based.

- [ ] **Step 5: Commit the migration and documentation**

  ```bash
  git add src/websocket/agent.gateway.ts README.md documentation/agents-and-tools.md documentation/structured-output-and-streaming.md
  git commit -m "docs: document asynchronous agent streaming"
  ```

## Plan Self-Review

- **Coverage:** Tasks 1 and 2 cover every identified runtime gap: history, recall, pre/post guardrails, before/after budgets, usage, persistence, lifecycle events, and stream errors. Task 3 migrates all discovered internal and documentation consumers.
- **Scope:** The plan deliberately excludes live token enforcement, new transport wrappers, and changes to `AiService`, which already has a separate API surface.
- **Consistency:** The introduced `prepareRun` and `completeRun` names, promise-based `stream()` API, and lifecycle event ordering are used consistently in every task.
