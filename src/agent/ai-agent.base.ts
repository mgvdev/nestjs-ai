import { Inject } from '@nestjs/common';
import type { AiInput } from '../messages/message.types.js';
import { AgentExecutorService } from './agent-executor.service.js';
import type { AgentResult, AgentRunOptions } from './agent.interface.js';

/**
 * Base class for `@Agent`-decorated agents. Provides `.run()` and `.stream()`
 * by delegating to the {@link AgentExecutorService}, which is property-injected
 * so subclasses need no constructor boilerplate.
 *
 * @example
 * ```ts
 * @Agent({ model: 'openai:gpt-4o', system: 'You are helpful.' })
 * class ChatAgent extends AiAgent {}
 *
 * // elsewhere
 * const { text } = await chatAgent.run('Hello!');
 * ```
 */
export abstract class AiAgent {
  @Inject(AgentExecutorService)
  protected readonly executor!: AgentExecutorService;

  /** Runs the agent to completion. */
  run<T = unknown>(
    input: AiInput,
    opts?: AgentRunOptions,
  ): Promise<AgentResult<T>> {
    return this.executor.run<T>(this, input, opts);
  }

  /** Streams the agent's response (returns the raw Vercel stream result). */
  stream(input: AiInput, opts?: AgentRunOptions) {
    return this.executor.stream(this, input, opts);
  }
}
