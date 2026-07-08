import type { AgentResult, AgentRunOptions } from '../agent/agent.interface.js';

/** Event names emitted by the library (namespaced for `@OnEvent`). */
export const AI_EVENTS = {
  agentRunStart: 'ai.agent.run.start',
  agentRunFinish: 'ai.agent.run.finish',
  agentRunError: 'ai.agent.run.error',
  toolCall: 'ai.tool.call',
  toolResult: 'ai.tool.result',
  streamFinish: 'ai.stream.finish',
} as const;

export interface AgentRunStartPayload {
  agent: string;
  input: unknown;
  options: AgentRunOptions;
}

export interface AgentRunFinishPayload {
  agent: string;
  result: AgentResult;
}

export interface AgentRunErrorPayload {
  agent: string;
  error: unknown;
}

export interface ToolCallPayload {
  tool: string;
  args: unknown;
}

export interface ToolResultPayload {
  tool: string;
  args: unknown;
  result: unknown;
}
