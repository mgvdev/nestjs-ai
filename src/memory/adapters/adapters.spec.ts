import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiMessage } from '../../messages/message.types.js';
import { ConversationMessageEntity } from './typeorm/conversation-message.entity.js';
import { TypeOrmConversationStore } from './typeorm/typeorm-conversation.store.js';
import {
  type PrismaConversationDelegate,
  PrismaConversationStore,
} from './prisma/prisma-conversation.store.js';

describe('TypeOrmConversationStore', () => {
  let dataSource: DataSource;
  let store: TypeOrmConversationStore;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [ConversationMessageEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    store = new TypeOrmConversationStore(
      dataSource.getRepository(ConversationMessageEntity),
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('persists, loads in order, appends, and clears', async () => {
    await store.append('c1', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    let messages = await store.load('c1');
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('hi');

    await store.append('c1', [{ role: 'user', content: 'again' }]);
    messages = await store.load('c1');
    expect(messages).toHaveLength(3);
    expect(messages[2].content).toBe('again');

    await store.clear('c1');
    expect(await store.load('c1')).toHaveLength(0);
  });

  it('isolates conversations', async () => {
    await store.append('a', [{ role: 'user', content: 'a1' }]);
    await store.append('b', [{ role: 'user', content: 'b1' }]);
    expect(await store.load('a')).toHaveLength(1);
    expect((await store.load('b'))[0].content).toBe('b1');
  });
});

function fakeDelegate(): PrismaConversationDelegate {
  const rows: Array<{
    conversationId: string;
    role: string;
    content: unknown;
    position: number;
  }> = [];
  return {
    async findMany({ where, orderBy }) {
      return rows
        .filter((r) => r.conversationId === where.conversationId)
        .sort((a, b) =>
          orderBy.position === 'asc'
            ? a.position - b.position
            : b.position - a.position,
        )
        .map((r) => ({ role: r.role, content: r.content }));
    },
    async create({ data }) {
      rows.push({ ...data });
      return data;
    },
    async count({ where }) {
      return rows.filter((r) => r.conversationId === where.conversationId).length;
    },
    async deleteMany({ where }) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].conversationId === where.conversationId) {
          rows.splice(i, 1);
        }
      }
      return {};
    },
  };
}

describe('PrismaConversationStore', () => {
  it('persists, loads in order, and clears via a delegate', async () => {
    const store = new PrismaConversationStore(fakeDelegate());
    const messages: AiMessage[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ];
    await store.append('conv', messages);
    await store.append('conv', [{ role: 'user', content: 'q2' }]);

    const loaded = await store.load('conv');
    expect(loaded.map((m) => m.content)).toEqual(['q1', 'a1', 'q2']);

    await store.clear('conv');
    expect(await store.load('conv')).toHaveLength(0);
  });
});
