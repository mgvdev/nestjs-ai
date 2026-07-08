import type { Repository } from 'typeorm';
import type { AiMessage } from '../../../messages/message.types.js';
import type { ConversationStore } from '../../conversation-store.interface.js';
import { ConversationMessageEntity } from './conversation-message.entity.js';

/**
 * TypeORM-backed conversation store. Framework-agnostic: pass a
 * `Repository<ConversationMessageEntity>` (obtain it via `@nestjs/typeorm`'s
 * `getRepositoryToken` in a factory provider). Messages are ordered by an
 * append-only `position` column.
 *
 * @example
 * ```ts
 * AiModule.forRoot({
 *   conversationStore: {
 *     useFactory: (repo) => new TypeOrmConversationStore(repo),
 *     inject: [getRepositoryToken(ConversationMessageEntity)],
 *   },
 * })
 * ```
 */
export class TypeOrmConversationStore implements ConversationStore {
  constructor(
    private readonly repository: Repository<ConversationMessageEntity>,
  ) {}

  async load(conversationId: string): Promise<AiMessage[]> {
    const rows = await this.repository.find({
      where: { conversationId },
      order: { position: 'ASC' },
    });
    return rows.map((row) => ({
      role: row.role,
      content: row.content,
    })) as AiMessage[];
  }

  async append(
    conversationId: string,
    messages: AiMessage[],
  ): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    const base = await this.repository.count({ where: { conversationId } });
    const entities = messages.map((message, index) =>
      this.repository.create({
        conversationId,
        role: message.role,
        content: message.content,
        position: base + index,
      }),
    );
    await this.repository.save(entities);
  }

  async clear(conversationId: string): Promise<void> {
    await this.repository.delete({ conversationId });
  }
}
