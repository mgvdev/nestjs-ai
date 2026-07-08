import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { GUARDRAIL_METADATA } from '../ai.constants.js';
import type { AgentResult } from '../agent/agent.interface.js';
import type {
  Guardrail,
  GuardrailContext,
} from './guardrail.interface.js';

/**
 * Collects all `@Guardrail`-decorated providers and runs their hooks in
 * registration order around agent execution.
 */
@Injectable()
export class GuardrailRegistry implements OnModuleInit {
  private readonly guardrails: Guardrail[] = [];

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Guardrail | undefined;
      const ctor = instance?.constructor;
      if (
        instance &&
        ctor &&
        Reflect.getMetadata(GUARDRAIL_METADATA, ctor) === true
      ) {
        this.guardrails.push(instance);
      }
    }
  }

  get count(): number {
    return this.guardrails.length;
  }

  async runBeforeRun(ctx: GuardrailContext): Promise<void> {
    for (const guardrail of this.guardrails) {
      await guardrail.beforeRun?.(ctx);
    }
  }

  async runAfterRun(
    ctx: GuardrailContext,
    result: AgentResult,
  ): Promise<void> {
    for (const guardrail of this.guardrails) {
      await guardrail.afterRun?.(ctx, result);
    }
  }

  async runOnToolCall(tool: string, args: unknown): Promise<void> {
    for (const guardrail of this.guardrails) {
      await guardrail.onToolCall?.(tool, args);
    }
  }
}
