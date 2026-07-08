/**
 * Dependency-injection tokens used across the module.
 */
export const AI_MODULE_OPTIONS = Symbol('AI_MODULE_OPTIONS');
export const CONVERSATION_STORE = Symbol('CONVERSATION_STORE');
export const VECTOR_STORE = Symbol('VECTOR_STORE');
export const AI_CACHE = Symbol('AI_CACHE');
export const APPROVAL_GATE = Symbol('APPROVAL_GATE');
export const AGENT_QUEUE = Symbol('AGENT_QUEUE');

/**
 * Reflect metadata keys for the `@Tool` and `@Agent` decorators.
 */
export const TOOL_METADATA = Symbol('nestjs-ai:tool');
export const AGENT_METADATA = Symbol('nestjs-ai:agent');
export const GUARDRAIL_METADATA = Symbol('nestjs-ai:guardrail');

/**
 * Default number of tool-calling steps allowed before an agent run stops.
 */
export const DEFAULT_MAX_STEPS = 5;
