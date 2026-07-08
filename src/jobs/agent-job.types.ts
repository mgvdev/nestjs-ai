import type { AgentRunOptions } from '../agent/agent.interface.js';
import type { AiInput } from '../messages/message.types.js';

/** Payload of a queued agent run. */
export interface AgentJobData {
  /** Agent class name (as indexed by `AgentRegistry`). */
  agent: string;
  /** Input passed to the agent's `.run()`. */
  input: AiInput;
  /** Per-call run options. */
  options?: AgentRunOptions;
}

/** Minimal structural interface for a BullMQ-like queue. */
export interface QueueLike {
  add(
    name: string,
    data: AgentJobData,
    opts?: Record<string, unknown>,
  ): Promise<{ id?: string }>;
}
