import type { FinishReason, LanguageModelUsage, StepResult } from 'ai';
import type { ZodType } from 'zod';
import type { AiMessage } from '../messages/message.types.js';
import type { PromptRef } from '../prompts/prompt.types.js';

/**
 * Per-call overrides for an agent `.run()` / `.stream()`.
 */
export interface AgentRunOptions {
  /** Override the agent's model for this call. */
  model?: string;
  /** Override the agent's system prompt for this call. */
  system?: string;
  /** Resolve the system prompt from the PromptRegistry (overrides `system`). */
  systemPrompt?: PromptRef;
  /**
   * Conversation id. When set, prior messages are loaded from the
   * `ConversationStore` before the call and the new exchange is persisted after.
   */
  conversationId?: string;
  /** Override the maximum tool-calling steps. */
  maxSteps?: number;
  /** Structured-output schema for this call (overrides the agent's `output`). */
  schema?: ZodType<any, any, any>;
  /** Sampling temperature. */
  temperature?: number;
  /** Abort signal to cancel the underlying request. */
  abortSignal?: AbortSignal;
}

/**
 * Result of an agent `.run()`.
 */
export interface AgentResult<T = unknown> {
  /** Generated text (empty string for structured-output runs). */
  text: string;
  /** Parsed structured object, present only for structured-output runs. */
  object?: T;
  /** Per-step details for multi-step tool runs. */
  steps?: StepResult<any>[];
  /** Tool calls made during the run. */
  toolCalls?: unknown[];
  /** Aggregate token usage across all steps. */
  usage?: LanguageModelUsage;
  /** Why generation stopped. */
  finishReason?: FinishReason;
  /** Assistant/tool messages produced by the run. */
  messages: AiMessage[];
}
