import type { AiMessage } from '../messages/message.types.js';

/**
 * Persistence contract for conversation history. Implement this interface to
 * back conversations with a database, cache, or any other store, then register
 * it through `AiModule.forRoot({ conversationStore })`.
 */
export interface ConversationStore {
  /** Returns the ordered messages for a conversation (empty if unknown). */
  load(conversationId: string): Promise<AiMessage[]>;

  /** Appends messages to a conversation, preserving order. */
  append(conversationId: string, messages: AiMessage[]): Promise<void>;

  /** Removes all messages for a conversation. */
  clear(conversationId: string): Promise<void>;
}
