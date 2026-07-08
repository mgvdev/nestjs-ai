import { generateText } from 'ai';
import { describe, expect, it } from 'vitest';
import { Agent } from '../agent/agent.decorator.js';
import { AiAgent } from '../agent/ai-agent.base.js';
import { createEmbeddingMock, createMockModel } from './mock-model.js';
import { createTestingAiModule } from './testing.module.js';

@Agent({ model: 'm', system: 'test' })
class GreeterAgent extends AiAgent {}

describe('createMockModel', () => {
  it('drives generateText', async () => {
    const { text } = await generateText({
      model: createMockModel('Hello!'),
      prompt: 'hi',
    });
    expect(text).toBe('Hello!');
  });
});

describe('createEmbeddingMock', () => {
  it('produces vectors from the given fn', async () => {
    const model = createEmbeddingMock((v) => [v.length]);
    const { embeddings } = await model.doEmbed({ values: ['ab', 'abc'] } as any);
    expect(embeddings).toEqual([[2], [3]]);
  });
});

describe('createTestingAiModule', () => {
  it('boots AiModule with a mock model and runs an agent', async () => {
    const app = await createTestingAiModule({
      model: createMockModel('mocked answer'),
      providers: [GreeterAgent],
    });
    const { text } = await app.get(GreeterAgent).run('hello');
    expect(text).toBe('mocked answer');
    await app.close();
  });
});
