import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { AGENT_METADATA } from '../ai.constants.js';
import type { AgentOptions } from './agent.metadata.js';

/**
 * Declares a class as an AI agent. The class should extend {@link AiAgent} to
 * gain `.run()` / `.stream()`. `@Agent` also marks the class `@Injectable`, so
 * it participates in DI and can inject its own dependencies.
 *
 * @example
 * ```ts
 * @Agent({
 *   model: 'openai:gpt-4o',
 *   system: 'You are a helpful support assistant.',
 *   tools: [WeatherTools],
 * })
 * export class SupportAgent extends AiAgent {}
 * ```
 */
export function Agent(options: AgentOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(AGENT_METADATA, options, target);
    Injectable()(target);
  };
}
