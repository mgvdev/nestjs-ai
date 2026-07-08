import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { GUARDRAIL_METADATA } from '../ai.constants.js';

/**
 * Marks an injectable provider as a {@link Guardrail}. Discovered guardrails run
 * on every agent execution. The class may inject its own dependencies.
 *
 * @example
 * ```ts
 * @Guardrail()
 * export class BlockProfanity implements Guardrail {
 *   beforeRun(ctx: GuardrailContext) {
 *     if (containsProfanity(ctx.messages)) throw new Error('Blocked');
 *   }
 * }
 * ```
 */
export function Guardrail(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(GUARDRAIL_METADATA, true, target);
    Injectable()(target);
  };
}
