# Design : Suivi des coûts de tokens et blocage par appel

## Contexte

Le projet `@mgvdev/nestjs-ai` dispose déjà d'un mécanisme de suivi des coûts (`UsageTracker`) et d'un garde-fou budgétaire global par conversation (`BudgetGuard`). L'objectif est d'enrichir ces capacités pour :

1. Suivre le coût de **chaque appel** d'agent IA.
2. Permettre à l'utilisateur de la librairie d'**afficher** ces informations (coût, tokens envoyés, tokens reçus).
3. Pouvoir **bloquer** un appel selon des limites configurables et exécuter des actions personnalisées (message, log, etc.).

## État existant

- `UsageTracker` (`src/usage/usage-tracker.service.ts`) enregistre les tokens et le coût par conversation et globalement, puis émet `AI_EVENTS.usage`.
- `BudgetGuard` (`src/usage/budget.guardrail.ts`) bloque un appel **avant** exécution si le coût cumulé d'une conversation dépasse `maxCostPerConversation`.
- Les `Guardrail` (`src/observability/guardrail.interface.ts`) permettent d'intercepter les appels avant (`beforeRun`) et après (`afterRun`) exécution.
- `AgentResult` (`src/agent/agent.interface.ts`) expose déjà `usage?: LanguageModelUsage`.

## Objectifs

- Ajouter des limites configurables **par appel** : coût maximum, tokens d'entrée maximum, tokens de sortie maximum, tokens total maximum.
- Permettre la configuration globale via `AiModule.forRoot()` et le surclassement par agent via `@Agent()`.
- Offrir des **hooks de cycle de vie** budgétaire : `beforeRunBudget` (avant l'appel, async, peut bloquer) et `afterRunBudget` (après l'appel, avec coût/usage réel).
- Offrir un callback décisionnel au niveau de l'agent (`OnBudgetExceeded`) et un handler global (`BudgetExceededHandler`) pour les limites statiques dépassées.
- Conserver l'affichage des statistiques via les événements existants et `UsageTracker`.

## Architecture

L'approche repose sur l'extension du système de `Guardrail` existant avec un garde-fou post-appel (`RunBudgetGuardrail`) et un service `BudgetPolicy` qui centralise la résolution des limites et l'orchestration des callbacks. Le contrôle s'applique au chemin `run()` ; le streaming n'est pas couvert dans cette version.

```
AgentExecutorService (run())
    │
    ├─► appel SDK (generateText / generateObject)
    │
    ├─► UsageTracker.record() → émet AI_EVENTS.usage
    │
    ├─► GuardrailRegistry.runAfterRun(ctx, result)
    │       │
    │       └─► RunBudgetGuardrail
    │               └─► BudgetPolicy.enforceRunBudget()
    │
    └─► si dépassement : appel OnBudgetExceeded (agent) ou BudgetExceededHandler (global)
```

## Composants

### 1. Types et interfaces (`src/usage/budget.types.ts`)

```ts
import type { LanguageModelUsage } from 'ai';
import type { AgentResult, AgentRunOptions } from '../agent/agent.interface.js';
import type { AiMessage } from '../messages/message.types.js';

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

export interface BudgetCheckContext {
  agent: string;
  model: string;
  conversationId?: string;
  messages: AiMessage[];
  options: AgentRunOptions;
}

export interface BudgetRunContext {
  agent: string;
  model: string;
  conversationId?: string;
  usage: LanguageModelUsage;
  cost: number;
  result: AgentResult;
}

export interface BudgetExceededContext extends BudgetRunContext {
  exceeded: BudgetExceededKind;
  limit: number;
}

export type BudgetDecision =
  | { action: 'block'; reason?: string }
  | { action: 'allow' };
```

### 2. Callbacks (`src/usage/on-budget-exceeded.interface.ts`)

```ts
import type {
  BudgetCheckContext,
  BudgetDecision,
  BudgetExceededContext,
  BudgetRunContext,
} from './budget.types.js';

export interface OnBudgetExceeded {
  /** Called before the run; return block to abort or allow to proceed. */
  beforeRunBudget?(
    ctx: BudgetCheckContext,
  ): BudgetDecision | Promise<BudgetDecision> | void | Promise<void>;

  /** Called after the run with actual cost and usage. */
  afterRunBudget?(ctx: BudgetRunContext): void | Promise<void>;

  /** Called when a configured static limit is exceeded. */
  onBudgetExceeded?(
    ctx: BudgetExceededContext,
  ): BudgetDecision | Promise<BudgetDecision>;
}

export interface BudgetExceededHandler {
  beforeRunBudget?(
    ctx: BudgetCheckContext,
  ): BudgetDecision | Promise<BudgetDecision> | void | Promise<void>;

  afterRunBudget?(ctx: BudgetRunContext): void | Promise<void>;

  handleBudgetExceeded(
    ctx: BudgetExceededContext,
  ): BudgetDecision | Promise<BudgetDecision>;
}

export const BUDGET_EXCEEDED_HANDLER = Symbol('BUDGET_EXCEEDED_HANDLER');
```

### 3. Service `BudgetPolicy` (`src/usage/budget-policy.service.ts`)

Responsabilités :
- `beforeRunBudget` : appelle les hooks avant l'appel SDK ; peut bloquer via `RunBudgetExceededError`.
- `afterRunBudget` : appelle les hooks après l'appel avec coût/usage réel (déduction de crédits, log).
- `enforceRunBudget` : vérifie les limites statiques après l'appel et orchestre `onBudgetExceeded`.
- Résoudre les limites effectives (agent > global), calculer le coût via `costOf`.

Signature principale :

```ts
export class BudgetPolicy {
  enforceRunBudget(
    agentInstance: object,
    ctx: GuardrailContext,
    result: AgentResult,
  ): Promise<void>;
}
```

Si une limite est dépassée, `enforceRunBudget` appelle la chaîne de décision. En l'absence de callback ou si le callback retourne `block`, il lance `RunBudgetExceededError`. Si le callback retourne `allow`, l'appel se poursuit normalement.

### 4. Guardrail post-appel (`src/usage/run-budget.guardrail.ts`)

Un seul garde-fou vérifie tous les seuils configurés pour éviter les déclenchements multiples sur le même run.

```ts
@Guardrail()
@Injectable()
export class RunBudgetGuardrail implements Guardrail {
  constructor(private readonly policy: BudgetPolicy) {}

  async afterRun(ctx: GuardrailContext, result: AgentResult): Promise<void> {
    await this.policy.enforceRunBudget(ctx.agentInstance, ctx, result);
  }
}
```

> **Note :** l'interface `GuardrailContext` doit être étendue pour transporter l'instance de l'agent (pas seulement son nom), afin de pouvoir tester `implements OnBudgetExceeded`.

### 5. Extension des métadonnées agent

#### `src/agent/agent.metadata.ts`

```ts
export interface AgentOptions {
  // ... champs existants
  budget?: BudgetLimits;
}
```

#### `src/agent/agent.decorator.ts`

Le décorateur `@Agent()` accepte déjà `AgentOptions` ; aucun changement de signature n'est requis si `budget` est ajouté à l'interface.

### 6. Modification de l'exécuteur (`src/agent/agent-executor.service.ts`)

- Injecter `BudgetPolicy` en optionnel.
- Étendre `GuardrailContext` avec `agentInstance: object`.
- Ordre d'exécution dans `run()` :
  1. `guardrails.runBeforeRun(ctx)`
  2. `budgetPolicy.beforeRunBudget(agent, ctx)` — peut bloquer avant le call
  3. appel SDK
  4. `UsageTracker.record()`
  5. `budgetPolicy.afterRunBudget(agent, ctx, result)` — déduction/log
  6. `guardrails.runAfterRun(ctx, result)` — limites statiques
- S'assurer que `UsageTracker.record()` est appelé avant les hooks post-appel.

### 7. Configuration du module

#### `src/interfaces/ai-module-options.interface.ts`

```ts
export interface AiModuleOptions {
  // ... champs existants
  budget?: BudgetLimits;
  budgetExceededHandler?: Type<BudgetExceededHandler> | {
    useClass?: Type<BudgetExceededHandler>;
    useFactory?: (...args: any[]) => BudgetExceededHandler | Promise<BudgetExceededHandler>;
    useValue?: BudgetExceededHandler;
    inject?: any[];
  };
}
```

#### `src/ai.module.ts`

- Enregistrer `BudgetPolicy` dans les providers core.
- Enregistrer `RunBudgetGuardrail` quand `budget` est présent dans les options.
- Enregistrer le handler global si `budgetExceededHandler` est fourni.

## Exemples d'utilisation

### Configuration globale

```ts
AiModule.forRoot({
  budget: {
    maxCostPerRun: 0.05,
    maxTotalTokensPerRun: 4000,
  },
});
```

### Override par agent

```ts
@Agent({
  model: 'openai:gpt-4o',
  budget: {
    maxCostPerRun: 0.10,
  },
})
export class SupportAgent extends AiAgent implements OnBudgetExceeded {
  async onBudgetExceeded(ctx: BudgetExceededContext): Promise<BudgetDecision> {
    // Log interne, notification, etc.
    return { action: 'block', reason: 'Limite de coût par appel dépassée' };
  }
}
```

### Handler global

```ts
@Injectable()
export class SlackBudgetAlert implements BudgetExceededHandler {
  async handleBudgetExceeded(ctx: BudgetExceededContext): Promise<BudgetDecision> {
    await this.slack.post(`Agent ${ctx.agent} a dépassé la limite ${ctx.exceeded}.`);
    return { action: 'block', reason: 'Limite budgétaire dépassée' };
  }
}

AiModule.forRoot({
  budgetExceededHandler: SlackBudgetAlert,
});
```

### Limite dynamique depuis une BDD

```ts
@Agent({ model: 'openai:gpt-4o' })
export class PremiumAgent extends AiAgent implements OnBudgetExceeded {
  constructor(private readonly credits: CreditRepository) {
    super();
  }

  async beforeRunBudget(ctx: BudgetCheckContext): Promise<BudgetDecision> {
    const balance = await this.credits.getBalance(ctx.agent);
    if (balance <= 0) {
      return { action: 'block', reason: 'Crédits épuisés' };
    }
    return { action: 'allow' };
  }

  async afterRunBudget(ctx: BudgetRunContext): Promise<void> {
    await this.credits.deduct(ctx.agent, ctx.cost);
  }
}
```

### Affichage des statistiques

```ts
@Injectable()
export class CostLogger {
  @OnEvent(AI_EVENTS.usage)
  handleUsage(record: UsageRecord) {
    console.log(
      `[${record.agent}] tokens: ${record.inputTokens}/${record.outputTokens}, coût: $${record.cost.toFixed(6)}`,
    );
  }
}
```

Ou via le service injecté :

```ts
const totals = usageTracker.totals(conversationId);
```

## Résolution des limites

Ordre de priorité pour chaque seuil :

1. `@Agent({ budget })` si défini.
2. `AiModule.forRoot({ budget })` si défini.
3. Aucune limite.

## Chaîne de décision en cas de dépassement

1. Si la classe agent implémente `OnBudgetExceeded`, appeler `agent.onBudgetExceeded(ctx)`.
2. Sinon, si un `BudgetExceededHandler` global est enregistré, appeler `handler.handleBudgetExceeded(ctx)`.
3. Sinon, comportement par défaut : lancer `RunBudgetExceededError`.

Si le callback retourne :
- `{ action: 'allow' }` : l'appel se termine normalement.
- `{ action: 'block', reason? }` : lancer `RunBudgetExceededError` avec la raison optionnelle.

## Hooks de cycle de vie

- `beforeRunBudget(ctx: BudgetCheckContext)` est appelé **avant** le call SDK. L'agent et le handler global peuvent retourner `block` pour empêcher l'appel (utile pour limites dynamiques / crédits BDD).
- `afterRunBudget(ctx: BudgetRunContext)` est appelé **après** le call SDK avec le coût et l'usage réel. Il est appelé avant `enforceRunBudget`, donc même si une limite statique est dépassée, le hook peut déjà avoir déduit des crédits.

Ordre d'appel complet dans `AgentExecutorService.run()` :
1. `guardrails.runBeforeRun(ctx)`
2. `budgetPolicy.beforeRunBudget(agent, ctx)`
3. appel SDK
4. `UsageTracker.record()`
5. `budgetPolicy.afterRunBudget(agent, ctx, result)`
6. `guardrails.runAfterRun(ctx, result)` (`RunBudgetGuardrail` -> `enforceRunBudget`)

Le remplacement du résultat n'est pas pris en charge dans cette version ; il peut être ajouté ultérieurement en modifiant le registre de guardrails pour permettre de retourner un résultat modifié.

## Gestion des erreurs

- `RunBudgetExceededError` étend `BudgetExceededError` existant avec : `agent`, `conversationId`, `exceeded`, `limit`, `cost`, `reason`.
- Le message par défaut reste explicite et actionnable.
- L'utilisateur peut catcher `RunBudgetExceededError` pour afficher un message ou journaliser.

## Tests

### Tests unitaires

- `budget-policy.service.spec.ts` :
  - Résolution des limites (agent > global).
  - Calcul du dépassement pour chaque type de limite.
  - Orchestration des callbacks (agent, global, défaut).
  - Décision `allow` vs `block`.
  - Dédoublonnage : un seul déclenchement par run même si coût et tokens dépassés.

- `run-budget.guardrail.spec.ts` :
  - Passe quand aucune limite n'est atteinte.
  - Déclenche `BudgetPolicy` quand une limite est atteinte.

### Tests d'intégration

- Ajouter un scénario dans `src/integration.spec.ts` ou `src/usage/usage.spec.ts` :
  - Mock de modèle retournant un usage élevé.
  - Vérification du blocage et du message d'erreur.

### Tests de régression

- Vérifier que `BudgetGuard` existant continue de fonctionner.
- Vérifier que `AI_EVENTS.usage` est toujours émis.

## Fichiers créés

- `src/usage/budget.types.ts`
- `src/usage/on-budget-exceeded.interface.ts`
- `src/usage/run-budget-exceeded.error.ts`
- `src/usage/budget-policy.service.ts`
- `src/usage/run-budget.guardrail.ts`

## Fichiers modifiés

- `src/agent/agent.metadata.ts`
- `src/agent/agent.decorator.ts` (si besoin d'ajustement de typage)
- `src/agent/agent-executor.service.ts`
- `src/interfaces/ai-module-options.interface.ts`
- `src/ai.module.ts`
- `src/observability/guardrail.interface.ts` (extension de `GuardrailContext`)
- `src/index.ts` (exports publics)

## Dépendances

Aucune nouvelle dépendance externe. Le code s'appuie sur :
- `@nestjs/common`, `@nestjs/core`
- `ai` (types `LanguageModelUsage`, `FinishReason`)
- `@nestjs/event-emitter` (déjà optionnel via `AiEventEmitter`)
