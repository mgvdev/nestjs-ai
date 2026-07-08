# Memory

Two complementary systems: **conversation history** (raw turns) and **semantic
memory** (embedding-based recall).

## Conversation history

Pass a `conversationId` to load prior turns before a run and persist the new
exchange after.

```ts
await agent.run('What about tomorrow?', { conversationId: user.id });
```

The default `ConversationStore` is in-memory. Provide your own by implementing
the interface:

```ts
interface ConversationStore {
  load(conversationId: string): Promise<AiMessage[]>;
  append(conversationId: string, messages: AiMessage[]): Promise<void>;
  clear(conversationId: string): Promise<void>;
}
```

### TypeORM store

From `@mgvdev/nestjs-ai/typeorm` (needs `typeorm` + `@nestjs/typeorm`):

```ts
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { ConversationMessageEntity, TypeOrmConversationStore } from '@mgvdev/nestjs-ai/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationMessageEntity]),
    AiModule.forRoot({
      providers: { openai: { apiKey } },
      conversationStore: {
        useFactory: (repo) => new TypeOrmConversationStore(repo),
        inject: [getRepositoryToken(ConversationMessageEntity)],
      },
    }),
  ],
})
export class AppModule {}
```

### Prisma store

No build-time dependency — pass a model delegate:

```ts
import { PrismaConversationStore } from '@mgvdev/nestjs-ai';

AiModule.forRoot({
  conversationStore: {
    useFactory: (prisma: PrismaService) => new PrismaConversationStore(prisma.aiMessage),
    inject: [PrismaService],
  },
});
```

```prisma
model AiMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String
  content        Json
  position       Int
  createdAt      DateTime @default(now())
  @@index([conversationId])
}
```

## Semantic memory

`SemanticMemory` stores snippets per conversation as embeddings and recalls the
most relevant ones — useful for long-term facts beyond raw turns.

```ts
await this.memory.remember(conversationId, 'The user prefers dark mode.');

// recall relevant snippets:
const hits = await this.memory.recall(conversationId, 'settings', { topK: 3 });

// summarize a conversation and store it (requires AiService):
await this.memory.rememberConversation(conversationId, messages, { summarize: true });
```

### Automatic recall in a run

```ts
await agent.run('what are my settings?', {
  conversationId,
  recall: { topK: 3 },   // recalled snippets are prepended to the system prompt
});
```

Semantic memory uses the configured `VectorStore` (isolated per conversation via
metadata), so it works with in-memory, pgvector, Qdrant, or Pinecone.
