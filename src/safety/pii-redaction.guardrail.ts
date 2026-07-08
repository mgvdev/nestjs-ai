import { Injectable, type Type } from '@nestjs/common';
import { Guardrail } from '../observability/guardrail.decorator.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from '../observability/guardrail.interface.js';
import type { AiMessage } from '../messages/message.types.js';

/** Default PII regexes: email, phone, credit card, US SSN. */
export const DEFAULT_PII_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:\d[ -]*?){13,16}\b/g,
  /(?:\+?\d[\d\s().-]{7,}\d)/g,
];

export interface PiiRedactionOptions {
  patterns?: RegExp[];
  replacement?: string;
}

/** Redacts PII matches in a string. */
export function redactPii(
  text: string,
  patterns: RegExp[] = DEFAULT_PII_PATTERNS,
  replacement = '[REDACTED]',
): string {
  let out = text;
  for (const pattern of patterns) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Redacts PII in every message's textual content, in place. */
export function redactMessages(
  messages: AiMessage[],
  patterns: RegExp[] = DEFAULT_PII_PATTERNS,
  replacement = '[REDACTED]',
): void {
  for (const message of messages) {
    const content = (message as { content: unknown }).content;
    if (typeof content === 'string') {
      (message as { content: unknown }).content = redactPii(
        content,
        patterns,
        replacement,
      );
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          part.text = redactPii(part.text, patterns, replacement);
        }
      }
    }
  }
}

/**
 * Guardrail that redacts PII in the messages sent to the model (default
 * patterns). For custom patterns use {@link createPiiRedactionGuardrail}.
 */
@Guardrail()
@Injectable()
export class PiiRedactionGuardrail implements GuardrailContract {
  beforeRun(ctx: GuardrailContext): void {
    redactMessages(ctx.messages);
  }
}

/** Builds a configured PII-redaction guardrail class (discoverable via DI). */
export function createPiiRedactionGuardrail(
  options: PiiRedactionOptions = {},
): Type<GuardrailContract> {
  const patterns = options.patterns ?? DEFAULT_PII_PATTERNS;
  const replacement = options.replacement ?? '[REDACTED]';

  @Guardrail()
  @Injectable()
  class ConfiguredPiiRedaction implements GuardrailContract {
    beforeRun(ctx: GuardrailContext): void {
      redactMessages(ctx.messages, patterns, replacement);
    }
  }
  return ConfiguredPiiRedaction;
}
