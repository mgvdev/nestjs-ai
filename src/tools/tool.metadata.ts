import type { ZodType } from 'zod';

/**
 * Options accepted by the `@Tool` decorator.
 */
export interface ToolOptions {
  /** Tool name exposed to the model. Defaults to the method name. */
  name?: string;
  /** Human-readable description the model uses to decide when to call it. */
  description: string;
  /** Zod schema describing the tool's input arguments. */
  schema: ZodType<any, any, any>;
}

/**
 * Metadata stored on a `@Tool`-decorated method.
 */
export interface ToolMetadata extends ToolOptions {
  methodName: string;
}
