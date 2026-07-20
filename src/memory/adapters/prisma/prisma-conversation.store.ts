import type { AiMessage } from '../../../messages/message.types.js';
import type { ConversationStore } from '../../conversation-store.interface.js';

/**
 * Minimal shape of a Prisma model delegate this store needs. Pass your
 * generated delegate (e.g. `prisma.aiMessage`) — no dependency on
 * `@prisma/client` is required by this library.
 *
 * Expected Prisma model:
 * ```prisma
 * model AiMessage {
 *   id             String   @id @default(cuid())
 *   conversationId String
 *   role           String
 *   content        Json
 *   position       Int
 *   createdAt      DateTime @default(now())
 *   @@index([conversationId])
 * }
 * ```
 */
export interface PrismaConversationDelegate {
  findMany(args: {
    where: { conversationId: string };
    orderBy: { position: 'asc' | 'desc' };
  }): Promise<Array<{ role: string; content: unknown }>>;
  create(args: {
    data: {
      conversationId: string;
      role: string;
      content: unknown;
      position: number;
    };
  }): Promise<unknown>;
  count(args: { where: { conversationId: string } }): Promise<number>;
  deleteMany(args: { where: { conversationId: string } }): Promise<unknown>;
}

/**
 * Prisma-backed conversation store built on a delegate interface, so it works
 * with any generated Prisma client without a compile-time dependency on it.
 */
export class PrismaConversationStore implements ConversationStore {
  constructor(private readonly delegate: PrismaConversationDelegate) {}

  async load(conversationId: string): Promise<AiMessage[]> {
    const rows = await this.delegate.findMany({
      where: { conversationId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => ({
      role: row.role,
      content: row.content,
    })) as AiMessage[];
  }

  async append(conversationId: string, messages: AiMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    const base = await this.delegate.count({ where: { conversationId } });
    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      await this.delegate.create({
        data: {
          conversationId,
          role: message.role,
          content: message.content,
          position: base + index,
        },
      });
    }
  }

  async clear(conversationId: string): Promise<void> {
    await this.delegate.deleteMany({ where: { conversationId } });
  }
}
