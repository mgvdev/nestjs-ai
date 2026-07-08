import type { ZodType } from 'zod';
import type { ToolRef } from '../tools/tool.registry.js';

/**
 * Configuration provided to the `@Agent` class decorator.
 */
export interface AgentOptions {
  /** Model id, e.g. `"openai:gpt-4o"`. Array = fallback chain. */
  model?: string | string[];
  /** System prompt establishing the agent's role and behavior. */
  system?: string;
  /** Tools the agent may call: provider classes and/or tool names. */
  tools?: ToolRef[];
  /** Maximum tool-calling steps before the run stops. */
  maxSteps?: number;
  /** Default Zod schema for structured output. Enables object generation. */
  output?: ZodType<any, any, any>;
}
