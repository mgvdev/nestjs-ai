import type { AgentResult, AgentRunOptions } from '../agent/agent.interface.js';
import type { AiMessage } from '../messages/message.types.js';

/** Mutable context passed to guardrails before an agent run. */
export interface GuardrailContext {
  agent: string;
  /** The agent instance being executed. */
  agentInstance: object;
  /** Messages to be sent; a guardrail may mutate this array in place. */
  messages: AiMessage[];
  options: AgentRunOptions;
}

/**
 * A guardrail can inspect, mutate, or block agent runs and tool calls. Throw
 * from any hook to abort the run. Register guardrails via
 * `AiModule.forRoot({ guardrails })` or `forFeature({ guardrails })`.
 */
export interface Guardrail {
  /** Runs before generation. Mutate `ctx.messages` or throw to block. */
  beforeRun?(ctx: GuardrailContext): void | Promise<void>;
  /** Runs after generation with the result. */
  afterRun?(
    ctx: GuardrailContext,
    result: AgentResult,
  ): void | Promise<void>;
  /** Runs before a tool executes. Throw to block the tool call. */
  onToolCall?(tool: string, args: unknown): void | Promise<void>;
}
