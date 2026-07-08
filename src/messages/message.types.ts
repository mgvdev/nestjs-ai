import type { ModelMessage } from 'ai';

/**
 * A single conversation message, re-exported from the AI SDK so consumers of
 * this library never need to import `ai` types directly.
 */
export type AiMessage = ModelMessage;

/**
 * The input accepted by agent `.run()` / `.stream()` and the raw facade: either
 * a plain user string or an explicit list of messages.
 */
export type AiInput = string | AiMessage[];

/** Normalizes a string or message list into a message array. */
export function toMessages(input: AiInput): AiMessage[] {
  if (typeof input === 'string') {
    return [{ role: 'user', content: input }];
  }
  return input;
}
