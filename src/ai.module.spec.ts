import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AiModule } from './ai.module.js';
import { AI_MODULE_OPTIONS, CONVERSATION_STORE } from './ai.constants.js';
import { AiService } from './core/ai.service.js';
import { AgentExecutorService } from './agent/agent-executor.service.js';
import { EmbeddingsService } from './embeddings/embeddings.service.js';
import { InMemoryConversationStore } from './memory/in-memory-conversation.store.js';
import type { ConversationStore } from './memory/conversation-store.interface.js';
import type { AiMessage } from './messages/message.types.js';

@Injectable()
class CustomStore implements ConversationStore {
  async load(): Promise<AiMessage[]> {
    return [];
  }
  async append(): Promise<void> {}
  async clear(): Promise<void> {}
}

describe('AiModule', () => {
  it('wires core services with forRoot and defaults to the in-memory store', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AiModule.forRoot({ providers: { openai: { apiKey: 'test' } } })],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(AiService)).toBeInstanceOf(AiService);
    expect(moduleRef.get(AgentExecutorService)).toBeInstanceOf(AgentExecutorService);
    expect(moduleRef.get(EmbeddingsService)).toBeInstanceOf(EmbeddingsService);
    expect(moduleRef.get(CONVERSATION_STORE)).toBeInstanceOf(InMemoryConversationStore);
    await moduleRef.close();
  });

  it('builds options via forRootAsync', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRootAsync({
          useFactory: () => ({
            providers: { openai: { apiKey: 'test' } },
            defaultModel: 'openai:gpt-4o',
          }),
        }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(AI_MODULE_OPTIONS)).toMatchObject({
      defaultModel: 'openai:gpt-4o',
    });
    await moduleRef.close();
  });

  it('accepts a custom conversation store', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          providers: { openai: { apiKey: 'test' } },
          conversationStore: CustomStore,
        }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(CONVERSATION_STORE)).toBeInstanceOf(CustomStore);
    await moduleRef.close();
  });
});
