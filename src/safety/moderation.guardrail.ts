import { Injectable, type Type } from '@nestjs/common';
import { Guardrail } from '../observability/guardrail.decorator.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from '../observability/guardrail.interface.js';
import type { AiMessage } from '../messages/message.types.js';

/** Thrown when moderation blocks content. */
export class ContentBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`Content blocked by moderation: ${reason}`);
    this.name = 'ContentBlockedError';
  }
}

export interface ModerationOptions {
  /** Case-insensitive terms that block a run when present. */
  blocked?: string[];
  /**
   * Optional async check returning `true` to block. Runs in addition to the
   * deny-list (e.g. call a provider moderation endpoint).
   */
  moderate?: (text: string) => boolean | Promise<boolean>;
}

/** Concatenates the textual content of messages. */
export function messagesText(messages: AiMessage[]): string {
  return messages
    .map((m) => {
      const content = (m as { content: unknown }).content;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
          .join(' ');
      }
      return '';
    })
    .join('\n');
}

/**
 * Builds a moderation guardrail that blocks runs whose input contains a
 * deny-listed term or fails a custom `moderate` check.
 */
export function createModerationGuardrail(
  options: ModerationOptions = {},
): Type<GuardrailContract> {
  const blocked = (options.blocked ?? []).map((t) => t.toLowerCase());
  const moderate = options.moderate;

  @Guardrail()
  @Injectable()
  class ConfiguredModeration implements GuardrailContract {
    async beforeRun(ctx: GuardrailContext): Promise<void> {
      const text = messagesText(ctx.messages);
      const lower = text.toLowerCase();
      const hit = blocked.find((term) => lower.includes(term));
      if (hit) {
        throw new ContentBlockedError(`matched blocked term "${hit}"`);
      }
      if (moderate && (await moderate(text))) {
        throw new ContentBlockedError('failed custom moderation');
      }
    }
  }
  return ConfiguredModeration;
}
