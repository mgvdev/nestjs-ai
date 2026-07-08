import { Injectable } from '@nestjs/common';
import type { AiMessage } from '../messages/message.types.js';
import type { ConversationStore } from './conversation-store.interface.js';

/**
 * Default in-process conversation store. Suitable for development, tests, and
 * single-instance deployments. History is lost on restart and not shared
 * across processes — provide a persistent implementation for production.
 */
@Injectable()
export class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, AiMessage[]>();

  async load(conversationId: string): Promise<AiMessage[]> {
    return [...(this.conversations.get(conversationId) ?? [])];
  }

  async append(conversationId: string, messages: AiMessage[]): Promise<void> {
    const existing = this.conversations.get(conversationId) ?? [];
    this.conversations.set(conversationId, [...existing, ...messages]);
  }

  async clear(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
  }
}
