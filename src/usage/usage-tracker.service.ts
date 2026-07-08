import { Inject, Injectable, Optional } from '@nestjs/common';
import { AI_MODULE_OPTIONS } from '../ai.constants.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import { AiEventEmitter } from '../observability/ai-event-emitter.js';
import { AI_EVENTS } from '../observability/ai-events.js';
import { costOf, type UsageLike } from './pricing.js';

/** Accumulated usage totals for a scope (conversation or global). */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  runs: number;
}

/** A single recorded run's usage. */
export interface UsageRecord extends UsageTotals {
  conversationId?: string;
  agent?: string;
  model: string;
}

const GLOBAL = '__global__';

function empty(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cost: 0, runs: 0 };
}

/**
 * Tracks token usage and USD cost per conversation (and globally), and emits an
 * `ai.usage` event per recorded run.
 */
@Injectable()
export class UsageTracker {
  private readonly totalsByScope = new Map<string, UsageTotals>();

  constructor(
    @Inject(AI_MODULE_OPTIONS) private readonly options: AiModuleOptions,
    @Optional() private readonly events?: AiEventEmitter,
  ) {}

  /** Records a run's usage, returns the single-run record, emits `ai.usage`. */
  record(entry: {
    model: string;
    usage: UsageLike | undefined;
    conversationId?: string;
    agent?: string;
  }): UsageRecord {
    const usage = entry.usage ?? {};
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const cost = costOf(usage, entry.model, this.options.pricing);

    for (const scope of [GLOBAL, entry.conversationId].filter(
      Boolean,
    ) as string[]) {
      const totals = this.totalsByScope.get(scope) ?? empty();
      totals.inputTokens += inputTokens;
      totals.outputTokens += outputTokens;
      totals.cost += cost;
      totals.runs += 1;
      this.totalsByScope.set(scope, totals);
    }

    const record: UsageRecord = {
      conversationId: entry.conversationId,
      agent: entry.agent,
      model: entry.model,
      inputTokens,
      outputTokens,
      cost,
      runs: 1,
    };
    this.events?.emit(AI_EVENTS.usage, record);
    return record;
  }

  /** Totals for a conversation, or global totals when no id is given. */
  totals(conversationId?: string): UsageTotals {
    return { ...(this.totalsByScope.get(conversationId ?? GLOBAL) ?? empty()) };
  }

  /** Clears totals for a conversation (or all when no id). */
  reset(conversationId?: string): void {
    if (conversationId) {
      this.totalsByScope.delete(conversationId);
    } else {
      this.totalsByScope.clear();
    }
  }
}
