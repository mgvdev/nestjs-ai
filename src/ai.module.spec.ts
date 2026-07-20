import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AiModule } from './ai.module.js';
import {
  AI_MODULE_OPTIONS,
  CONVERSATION_STORE,
  VECTOR_STORE,
} from './ai.constants.js';
import { AiService } from './core/ai.service.js';
import { AgentExecutorService } from './agent/agent-executor.service.js';
import { EmbeddingsService } from './embeddings/embeddings.service.js';
import { ImageService } from './multimodal/image.service.js';
import { SpeechService } from './multimodal/speech.service.js';
import { TranscriptionService } from './multimodal/transcription.service.js';
import { RagService } from './rag/rag.service.js';
import { InMemoryVectorStore } from './rag/in-memory-vector-store.js';
import { PromptRegistry } from './prompts/prompt-registry.service.js';
import { AiEventEmitter } from './observability/ai-event-emitter.js';
import { GuardrailRegistry } from './observability/guardrail.registry.js';
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
      imports: [
        AiModule.forRoot({ providers: { openai: { apiKey: 'test' } } }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(AiService)).toBeInstanceOf(AiService);
    expect(moduleRef.get(AgentExecutorService)).toBeInstanceOf(
      AgentExecutorService,
    );
    expect(moduleRef.get(EmbeddingsService)).toBeInstanceOf(EmbeddingsService);
    expect(moduleRef.get(ImageService)).toBeInstanceOf(ImageService);
    expect(moduleRef.get(SpeechService)).toBeInstanceOf(SpeechService);
    expect(moduleRef.get(TranscriptionService)).toBeInstanceOf(
      TranscriptionService,
    );
    expect(moduleRef.get(RagService)).toBeInstanceOf(RagService);
    expect(moduleRef.get(PromptRegistry)).toBeInstanceOf(PromptRegistry);
    expect(moduleRef.get(AiEventEmitter)).toBeInstanceOf(AiEventEmitter);
    expect(moduleRef.get(GuardrailRegistry)).toBeInstanceOf(GuardrailRegistry);
    expect(moduleRef.get(CONVERSATION_STORE)).toBeInstanceOf(
      InMemoryConversationStore,
    );
    expect(moduleRef.get(VECTOR_STORE)).toBeInstanceOf(InMemoryVectorStore);
    await moduleRef.close();
  });

  it('seeds prompts from options and resolves the event emitter as absent', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          providers: { openai: { apiKey: 'test' } },
          prompts: [{ name: 'greet', template: 'Hi {{who}}' }],
        }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(PromptRegistry).render('greet', { who: 'Max' })).toBe(
      'Hi Max',
    );
    // No @nestjs/event-emitter module imported -> emitter disabled, no-op.
    expect(moduleRef.get(AiEventEmitter).enabled).toBe(false);
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
