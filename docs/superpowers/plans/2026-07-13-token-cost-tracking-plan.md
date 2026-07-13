# Token Cost Tracking & Run Budget Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-run token cost limits with agent/global callbacks and observable usage statistics to `@mgvdev/nestjs-ai`.

**Architecture:** Extend `GuardrailContext` with the agent instance, add a `BudgetPolicy` service that resolves effective limits and orchestrates `OnBudgetExceeded` / `BudgetExceededHandler` callbacks, and invoke it via a new `BudgetGuardrail` after every agent run. Limits are configured globally in `AiModuleOptions` and overridable per `@Agent`.

**Tech Stack:** TypeScript, NestJS, Vercel AI SDK, Vitest.

## Global Constraints

- No new external dependencies.
- Follow existing conventions: `.js` extension in imports, `@Injectable()`, `@Guardrail()` decorator, `AI_MODULE_OPTIONS` token.
- Reuse `UsageTracker`, `costOf`, `BudgetExceededError` where possible.
- All new code must be covered by unit tests; add at least one integration scenario.
- Run `npm run test`, `npm run lint`, `npm run typecheck` (if available) before declaring done.

---

### Task 1: Types and callback interfaces

**Files:**
- Create: `src/usage/budget.types.ts`
- Create: `src/usage/on-budget-exceeded.interface.ts`
- Modify: `src/usage/budget.guardrail.ts` (move `BudgetExceededError` here or keep in existing file)

**Interfaces:**
- Consumes: nothing
- Produces: `BudgetLimits`, `BudgetExceededKind`, `BudgetExceededContext`, `BudgetDecision`, `OnBudgetExceeded`, `BudgetExceededHandler`, `BUDGET_EXCEEDED_HANDLER`

- [ ] **Step 1: Create `src/usage/budget.types.ts`**

```ts
import type { LanguageModelUsage } from 'ai';
import type { AgentResult } from '../agent/agent.interface.js';

export interface BudgetLimits {
  maxCostPerRun?: number;
  maxInputTokensPerRun?: number;
  maxOutputTokensPerRun?: number;
  maxTotalTokensPerRun?: number;
}

export type BudgetExceededKind =
  | 'cost'
  | 'inputTokens'
  | 'outputTokens'
  | 'totalTokens';

export interface BudgetExceededContext {
  agent: string;
  model: string;
  conversationId?: string;
  usage: LanguageModelUsage;
  cost: number;
  exceeded: BudgetExceededKind;
  limit: number;
  result: AgentResult;
}

export type BudgetDecision =
  | { action: 'block'; reason?: string }
  | { action: 'allow' };
```

- [ ] **Step 2: Create `src/usage/on-budget-exceeded.interface.ts`**

```ts
import type {
  BudgetDecision,
  BudgetExceededContext,
} from './budget.types.js';

export interface OnBudgetExceeded {
  onBudgetExceeded(
    ctx: BudgetExceededContext,
  ): BudgetDecision | Promise<BudgetDecision>;
}

export interface BudgetExceededHandler {
  handleBudgetExceeded(
    ctx: BudgetExceededContext,
  ): BudgetDecision | Promise<BudgetDecision>;
}

export const BUDGET_EXCEEDED_HANDLER = Symbol('BUDGET_EXCEEDED_HANDLER');
```

- [ ] **Step 3: Commit**

```bash
git add src/usage/budget.types.ts src/usage/on-budget-exceeded.interface.ts
git commit -m "feat(usage): add budget types and callback interfaces"
```

---

### Task 2: Extend `BudgetExceededError`

**Files:**
- Modify: `src/usage/budget.guardrail.ts`
- Create: `src/usage/run-budget-exceeded.error.ts` (optional)

**Interfaces:**
- Consumes: `BudgetExceededContext`
- Produces: `RunBudgetExceededError`

- [ ] **Step 1: Add `RunBudgetExceededError` extending `BudgetExceededError`**

In `src/usage/budget.guardrail.ts`:

```ts
export class RunBudgetExceededError extends BudgetExceededError {
  constructor(
    public readonly ctx: Pick<
      BudgetExceededContext,
      'agent' | 'conversationId' | 'exceeded' | 'limit' | 'cost'
    >,
    reason?: string,
  ) {
    super(
      ctx.conversationId,
      ctx.cost,
      ctx.limit,
    );
    this.name = 'RunBudgetExceededError';
    this.message =
      reason ??
      `Run budget exceeded for agent "${ctx.agent}"` +
        `${ctx.conversationId ? ` in conversation "${ctx.conversationId}"` : ''}: ` +
        `${ctx.exceeded}=${ctx.cost.toFixed(6)} >= ${ctx.limit}.`;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/usage/budget.guardrail.ts
git commit -m "feat(usage): add RunBudgetExceededError"
```

---

### Task 3: Extend `GuardrailContext`

**Files:**
- Modify: `src/observability/guardrail.interface.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `GuardrailContext` with `agentInstance: object`

- [ ] **Step 1: Add `agentInstance` to `GuardrailContext`**

```ts
export interface GuardrailContext {
  agent: string;
  agentInstance: object;
  messages: AiMessage[];
  options: AgentRunOptions;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/observability/guardrail.interface.ts
git commit -m "feat(observability): expose agent instance in guardrail context"
```

---

### Task 4: Implement `BudgetPolicy`

**Files:**
- Create: `src/usage/budget-policy.service.ts`
- Create: `src/usage/budget-policy.service.spec.ts`

**Interfaces:**
- Consumes: `BudgetLimits`, `BudgetExceededContext`, `BudgetDecision`, `OnBudgetExceeded`, `BudgetExceededHandler`, `BUDGET_EXCEEDED_HANDLER`, `UsageTracker`, `costOf`, `AI_MODULE_OPTIONS`, `AGENT_METADATA`
- Produces: `BudgetPolicy.enforceRunBudget()`

- [ ] **Step 1: Implement `BudgetPolicy`**

```ts
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AI_MODULE_OPTIONS, AGENT_METADATA } from '../ai.constants.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import { costOf, type UsageLike } from './pricing.js';
import type {
  BudgetDecision,
  BudgetExceededContext,
  BudgetExceededKind,
  BudgetLimits,
} from './budget.types.js';
import {
  BUDGET_EXCEEDED_HANDLER,
  type BudgetExceededHandler,
  type OnBudgetExceeded,
} from './on-budget-exceeded.interface.js';
import { RunBudgetExceededError } from './budget.guardrail.js';
import type { AgentResult } from '../agent/agent.interface.js';

function isOnBudgetExceeded(value: unknown): value is OnBudgetExceeded {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OnBudgetExceeded).onBudgetExceeded === 'function'
  );
}

@Injectable()
export class BudgetPolicy {
  constructor(
    @Inject(AI_MODULE_OPTIONS) private readonly options: AiModuleOptions,
    @Optional()
    @Inject(BUDGET_EXCEEDED_HANDLER)
    private readonly globalHandler?: BudgetExceededHandler,
  ) {}

  enforceRunBudget(
    agentInstance: object,
    ctx: GuardrailContext,
    result: AgentResult,
  ): void | Promise<void> {
    const limits = this.resolveLimits(agentInstance);
    const model = this.resolveModel(ctx, agentInstance);
    const cost = costOf(result.usage ?? {}, model, this.options.pricing);

    const exceeded = this.findExceededLimit(
      limits,
      result.usage ?? {},
      cost,
    );
    if (!exceeded) {
      return;
    }

    const budgetCtx: BudgetExceededContext = {
      agent: ctx.agent,
      model,
      conversationId: ctx.options.conversationId,
      usage: result.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      cost,
      exceeded: exceeded.kind,
      limit: exceeded.limit,
      result,
    };

    const decision = this.resolveDecision(agentInstance, budgetCtx);
    return this.applyDecision(decision, budgetCtx);
  }

  private resolveLimits(agentInstance: object): BudgetLimits {
    const agentLimits: BudgetLimits | undefined =
      Reflect.getMetadata(AGENT_METADATA, agentInstance.constructor)?.budget;
    return {
      ...this.options.budget,
      ...agentLimits,
    };
  }

  private resolveModel(
    ctx: GuardrailContext,
    agentInstance: object,
  ): string {
    const agentModel = Reflect.getMetadata(
      AGENT_METADATA,
      agentInstance.constructor,
    )?.model;
    return (
      (Array.isArray(ctx.options.model)
        ? ctx.options.model[0]
        : ctx.options.model) ??
      agentModel ??
      'unknown'
    );
  }

  private findExceededLimit(
    limits: BudgetLimits,
    usage: UsageLike,
    cost: number,
  ): { kind: BudgetExceededKind; limit: number } | undefined {
    if (
      limits.maxCostPerRun != null &&
      cost >= limits.maxCostPerRun
    ) {
      return { kind: 'cost', limit: limits.maxCostPerRun };
    }

    const input = usage.inputTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    const total = input + output;

    if (
      limits.maxInputTokensPerRun != null &&
      input >= limits.maxInputTokensPerRun
    ) {
      return { kind: 'inputTokens', limit: limits.maxInputTokensPerRun };
    }

    if (
      limits.maxOutputTokensPerRun != null &&
      output >= limits.maxOutputTokensPerRun
    ) {
      return { kind: 'outputTokens', limit: limits.maxOutputTokensPerRun };
    }

    if (
      limits.maxTotalTokensPerRun != null &&
      total >= limits.maxTotalTokensPerRun
    ) {
      return { kind: 'totalTokens', limit: limits.maxTotalTokensPerRun };
    }

    return undefined;
  }

  private async resolveDecision(
    agentInstance: object,
    ctx: BudgetExceededContext,
  ): Promise<BudgetDecision> {
    if (isOnBudgetExceeded(agentInstance)) {
      return await agentInstance.onBudgetExceeded(ctx);
    }
    if (this.globalHandler) {
      return await this.globalHandler.handleBudgetExceeded(ctx);
    }
    return { action: 'block' };
  }

  private async applyDecision(
    decision: BudgetDecision | Promise<BudgetDecision>,
    ctx: BudgetExceededContext,
  ): Promise<void> {
    const resolved = await decision;
    if (resolved.action === 'allow') {
      return;
    }
    throw new RunBudgetExceededError(ctx, resolved.reason);
  }
}
```

- [ ] **Step 2: Write unit tests `src/usage/budget-policy.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { BudgetPolicy } from './budget-policy.service.js';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import {
  BUDGET_EXCEEDED_HANDLER,
  type BudgetExceededHandler,
  type OnBudgetExceeded,
} from './on-budget-exceeded.interface.js';
import { RunBudgetExceededError } from './budget.guardrail.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import type { AgentResult } from '../agent/agent.interface.js';

describe('BudgetPolicy', () => {
  const build = async (options: any, handler?: BudgetExceededHandler) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BudgetPolicy,
        { provide: AI_MODULE_OPTIONS, useValue: options },
        ...(handler
          ? [{ provide: BUDGET_EXCEEDED_HANDLER, useValue: handler }]
          : []),
      ],
    }).compile();
    return moduleRef.get(BudgetPolicy);
  };

  const ctx = (agentName: string, instance: object): GuardrailContext => ({
    agent: agentName,
    agentInstance: instance,
    messages: [],
    options: {},
  });

  const result = (usage: { inputTokens: number; outputTokens: number }): AgentResult => ({
    text: '',
    usage: {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
    },
    messages: [],
  });

  it('does nothing when no limits are configured', async () => {
    const policy = await build({});
    await expect(
      policy.enforceRunBudget({}, ctx('A', {}), result({ inputTokens: 1000, outputTokens: 1000 })),
    ).resolves.toBeUndefined();
  });

  it('blocks when cost exceeds global limit', async () => {
    const policy = await build({
      budget: { maxCostPerRun: 0.001 },
      pricing: { gpt: { input: 1, output: 1 } },
    });
    await expect(
      policy.enforceRunBudget(
        {},
        ctx('A', {}),
        result({ inputTokens: 2000, outputTokens: 0 }),
      ),
    ).rejects.toThrow(RunBudgetExceededError);
  });

  it('uses agent override over global limit', async () => {
    class Agent {}
    Reflect.defineMetadata(
      Symbol('AI_AGENT_METADATA'),
      { budget: { maxCostPerRun: 1 }, model: 'gpt' },
      Agent,
    );
    const policy = await build({
      budget: { maxCostPerRun: 0.001 },
      pricing: { gpt: { input: 1, output: 1 } },
    });
    await expect(
      policy.enforceRunBudget(
        new Agent(),
        ctx('A', new Agent()),
        result({ inputTokens: 1000, outputTokens: 0 }),
      ),
    ).resolves.toBeUndefined();
  });

  it('calls agent callback and allows', async () => {
    class Agent implements OnBudgetExceeded {
      onBudgetExceeded = vi.fn().mockResolvedValue({ action: 'allow' as const });
    }
    const instance = new Agent();
    const policy = await build({ budget: { maxTotalTokensPerRun: 1 } });
    await policy.enforceRunBudget(
      instance,
      ctx('A', instance),
      result({ inputTokens: 10, outputTokens: 10 }),
    );
    expect(instance.onBudgetExceeded).toHaveBeenCalled();
  });

  it('falls back to global handler when agent has no callback', async () => {
    const handler: BudgetExceededHandler = {
      handleBudgetExceeded: vi.fn().mockResolvedValue({ action: 'block', reason: 'global' }),
    };
    const policy = await build({ budget: { maxTotalTokensPerRun: 1 } }, handler);
    await expect(
      policy.enforceRunBudget({}, ctx('A', {}), result({ inputTokens: 10, outputTokens: 10 })),
    ).rejects.toThrow('global');
  });
});
```

- [ ] **Step 3: Run unit tests**

```bash
npx vitest run src/usage/budget-policy.service.spec.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/usage/budget-policy.service.ts src/usage/budget-policy.service.spec.ts
git commit -m "feat(usage): implement BudgetPolicy with limits and callbacks"
```

---

### Task 5: Implement `BudgetGuardrail`

**Files:**
- Create: `src/usage/budget.guardrail.ts` (already exists with BudgetExceededError; extend or rename)
- Wait: existing `src/usage/budget.guardrail.ts` is `BudgetGuard` for conversation budgets. Keep it. Create `src/usage/run-budget.guardrail.ts`.

**Interfaces:**
- Consumes: `BudgetPolicy`, `GuardrailContext`, `AgentResult`
- Produces: `RunBudgetGuardrail`

- [ ] **Step 1: Create `src/usage/run-budget.guardrail.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { Guardrail } from '../observability/guardrail.decorator.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from '../observability/guardrail.interface.js';
import type { AgentResult } from '../agent/agent.interface.js';
import { BudgetPolicy } from './budget-policy.service.js';

@Guardrail()
@Injectable()
export class RunBudgetGuardrail implements GuardrailContract {
  constructor(private readonly policy: BudgetPolicy) {}

  async afterRun(
    ctx: GuardrailContext,
    result: AgentResult,
  ): Promise<void> {
    await this.policy.enforceRunBudget(ctx.agentInstance, ctx, result);
  }
}
```

- [ ] **Step 2: Create `src/usage/run-budget.guardrail.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { RunBudgetGuardrail } from './run-budget.guardrail.js';
import { BudgetPolicy } from './budget-policy.service.js';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import type { AgentResult } from '../agent/agent.interface.js';

describe('RunBudgetGuardrail', () => {
  it('delegates to BudgetPolicy', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RunBudgetGuardrail,
        BudgetPolicy,
        { provide: AI_MODULE_OPTIONS, useValue: {} },
      ],
    }).compile();
    const guardrail = moduleRef.get(RunBudgetGuardrail);
    const policy = moduleRef.get(BudgetPolicy);
    const spy = vi.spyOn(policy, 'enforceRunBudget').mockResolvedValue();

    const ctx: GuardrailContext = {
      agent: 'A',
      agentInstance: {},
      messages: [],
      options: {},
    };
    const result: AgentResult = { text: '', messages: [] };

    await guardrail.afterRun(ctx, result);
    expect(spy).toHaveBeenCalledWith({}, ctx, result);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/usage/run-budget.guardrail.spec.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/usage/run-budget.guardrail.ts src/usage/run-budget.guardrail.spec.ts
git commit -m "feat(usage): add RunBudgetGuardrail post-run guard"
```

---

### Task 6: Extend agent metadata and options

**Files:**
- Modify: `src/agent/agent.metadata.ts`
- Modify: `src/interfaces/ai-module-options.interface.ts`

**Interfaces:**
- Consumes: `BudgetLimits`, `BudgetExceededHandler`
- Produces: `AgentOptions.budget`, `AiModuleOptions.budget`, `AiModuleOptions.budgetExceededHandler`

- [ ] **Step 1: Add `budget` to `AgentOptions`**

In `src/agent/agent.metadata.ts`:

```ts
import type { BudgetLimits } from '../usage/budget.types.js';

export interface AgentOptions {
  // ... existing fields
  budget?: BudgetLimits;
}
```

- [ ] **Step 2: Add budget options to `AiModuleOptions`**

In `src/interfaces/ai-module-options.interface.ts`:

```ts
import type { BudgetLimits } from '../usage/budget.types.js';
import type { BudgetExceededHandler } from '../usage/on-budget-exceeded.interface.js';

export interface AiModuleOptions {
  // ... existing fields
  budget?: BudgetLimits;
  budgetExceededHandler?: Type<BudgetExceededHandler> | {
    useClass?: Type<BudgetExceededHandler>;
    useFactory?: (...args: any[]) => BudgetExceededHandler | Promise<BudgetExceededHandler>;
    useValue?: BudgetExceededHandler;
    inject?: any[];
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/agent/agent.metadata.ts src/interfaces/ai-module-options.interface.ts
git commit -m "feat(config): add budget limits and handler to module options"
```

---

### Task 7: Wire into `AgentExecutorService`

**Files:**
- Modify: `src/agent/agent-executor.service.ts`

**Interfaces:**
- Consumes: `BudgetPolicy`, `GuardrailContext`
- Produces: `GuardrailContext` with `agentInstance`

- [ ] **Step 1: Inject `BudgetPolicy` and pass agent instance in context**

Add to constructor:

```ts
@Optional() private readonly budgetPolicy?: BudgetPolicy,
```

Update context creation in `run()`:

```ts
const ctx: GuardrailContext = {
  agent: agentName,
  agentInstance: agent,
  messages: [...history, ...newMessages],
  options: opts,
};
```

Make sure `UsageTracker.record()` is called before `runAfterRun` (already is in current code).

- [ ] **Step 2: Apply same context change to `stream()`**

Find the guardrail context creation in `stream()` and add `agentInstance: agent`.

- [ ] **Step 3: Commit**

```bash
git add src/agent/agent-executor.service.ts
git commit -m "feat(agent): pass agent instance to guardrail context"
```

---

### Task 8: Wire into `AiModule`

**Files:**
- Modify: `src/ai.module.ts`
- Modify: `src/ai.constants.ts` (add `BUDGET_EXCEEDED_HANDLER` if not already exported)

**Interfaces:**
- Consumes: `RunBudgetGuardrail`, `BudgetPolicy`, `BUDGET_EXCEEDED_HANDLER`, `BudgetExceededHandler`
- Produces: registered providers

- [ ] **Step 1: Import and register new providers**

In `src/ai.module.ts`:

```ts
import { BudgetPolicy } from './usage/budget-policy.service.js';
import { RunBudgetGuardrail } from './usage/run-budget.guardrail.js';
import {
  BUDGET_EXCEEDED_HANDLER,
  type BudgetExceededHandler,
} from './usage/on-budget-exceeded.interface.js';
```

Add to `coreProviders()`:

```ts
BudgetPolicy,
```

Add conditional registration in `build()`:

```ts
...(options.budget != null ? [RunBudgetGuardrail] : []),
...AiModule.budgetExceededHandlerProvider(options.budgetExceededHandler),
```

Add helper method:

```ts
private static budgetExceededHandlerProvider(
  handler: AiModuleOptions['budgetExceededHandler'],
): Provider[] {
  if (!handler) {
    return [];
  }
  if ('useClass' in handler || 'useFactory' in handler || 'useValue' in handler) {
    return [
      {
        provide: BUDGET_EXCEEDED_HANDLER,
        ...handler,
      } as Provider,
    ];
  }
  return [{ provide: BUDGET_EXCEEDED_HANDLER, useClass: handler }];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ai.module.ts
git commit -m "feat(module): register BudgetPolicy and RunBudgetGuardrail"
```

---

### Task 9: Export public APIs

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: new symbols/types
- Produces: public exports

- [ ] **Step 1: Add exports**

```ts
export {
  BudgetLimits,
  BudgetExceededKind,
  BudgetExceededContext,
  BudgetDecision,
} from './usage/budget.types.js';
export {
  OnBudgetExceeded,
  BudgetExceededHandler,
  BUDGET_EXCEEDED_HANDLER,
} from './usage/on-budget-exceeded.interface.js';
export { BudgetPolicy } from './usage/budget-policy.service.js';
export { RunBudgetGuardrail } from './usage/run-budget.guardrail.js';
export { RunBudgetExceededError } from './usage/budget.guardrail.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat(exports): expose budget types, callbacks and guardrail"
```

---

### Task 10: Integration test

**Files:**
- Modify: `src/usage/usage.spec.ts` (create if not exists) or `src/integration.spec.ts`

**Interfaces:**
- Consumes: `AiModule`, `@Agent`, `AiAgent`, `RunBudgetExceededError`
- Produces: passing integration test

- [ ] **Step 1: Add integration scenario**

Create `src/usage/usage.spec.ts` if it does not exist, or append to existing:

```ts
import { Test } from '@nestjs/testing';
import { AiModule } from '../ai.module.js';
import { Agent } from '../agent/agent.decorator.js';
import { AiAgent } from '../agent/ai-agent.base.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import { RunBudgetExceededError } from './budget.guardrail.js';

describe('Run budget integration', () => {
  it('blocks a run that exceeds maxCostPerRun', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          budget: { maxCostPerRun: 0.001 },
          pricing: { 'mock-model': { input: 1, output: 1 } },
        }),
      ],
      providers: [
        {
          provide: ProviderRegistry,
          useValue: {
            getLanguageModel: () => ({
              modelId: 'mock-model',
              doGenerate: async () => ({
                text: 'expensive',
                usage: { promptTokens: 2000, completionTokens: 0, totalTokens: 2000 },
                finishReason: 'stop',
              }),
            }),
          },
        },
      ],
    }).compile();

    @Agent({ model: 'mock-model' })
    class CostlyAgent extends AiAgent {}

    const agent = moduleRef.get(CostlyAgent);
    await expect(agent.run('hello')).rejects.toThrow(RunBudgetExceededError);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/usage/usage.spec.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/usage/usage.spec.ts
git commit -m "test(usage): add run budget integration test"
```

---

### Task 11: Verification

- [ ] **Step 1: Run all tests**

```bash
npm run test
```

Expected: all tests pass

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add .
git commit -m "chore: fix lint/typecheck issues"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Limites par appel configurables (coût/tokens) | Task 6 |
| Configuration globale + override par agent | Task 4, Task 6 |
| Contrôle après l'appel sur usage réel | Task 5, Task 7 |
| Callback agent `OnBudgetExceeded` | Task 1, Task 4 |
| Handler global `BudgetExceededHandler` | Task 1, Task 4, Task 8 |
| Décision `allow` / `block` avec `reason` | Task 1, Task 4 |
| Affichage via events / UsageTracker | Already exists; verified in Task 11 |
| Tests unitaires et intégration | Task 4, Task 5, Task 10 |
| Pas de nouvelle dépendance externe | All tasks |
