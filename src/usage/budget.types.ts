import type { LanguageModelUsage } from 'ai';
import type { AgentResult } from '../agent/agent.interface.js';
import type { AiMessage } from '../messages/message.types.js';
import type { AgentRunOptions } from '../agent/agent.interface.js';

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
