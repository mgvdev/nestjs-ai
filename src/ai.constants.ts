/**
 * Dependency-injection tokens used across the module.
 */
export const AI_MODULE_OPTIONS = Symbol('AI_MODULE_OPTIONS');
export const CONVERSATION_STORE = Symbol('CONVERSATION_STORE');

/**
 * Reflect metadata keys for the `@Tool` and `@Agent` decorators.
 */
export const TOOL_METADATA = Symbol('nestjs-ai:tool');
export const AGENT_METADATA = Symbol('nestjs-ai:agent');

/**
 * Default number of tool-calling steps allowed before an agent run stops.
 */
export const DEFAULT_MAX_STEPS = 5;
