import {
  MockImageModelV2,
  MockSpeechModelV2,
  MockTranscriptionModelV2,
} from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { ProviderRegistry } from '../core/provider-registry.js';
import { ImageService } from './image.service.js';
import { SpeechService } from './speech.service.js';
import { TranscriptionService } from './transcription.service.js';

const response = { timestamp: new Date(0), modelId: 'mock', headers: {} };

function registryWith(overrides: Partial<ProviderRegistry>): ProviderRegistry {
  return overrides as ProviderRegistry;
}

describe('ImageService', () => {
  it('generates an image', async () => {
    const model = new MockImageModelV2({
      doGenerate: async () => ({
        images: ['aGVsbG8='],
        warnings: [],
        response,
      }),
    });
    const service = new ImageService(
      registryWith({ getImageModel: () => model }),
    );
    const result = await service.generate('a cat', { size: '1024x1024' });
    expect(result.images).toHaveLength(1);
    expect(result.image).toBeDefined();
  });
});

describe('SpeechService', () => {
  it('synthesizes audio', async () => {
    const model = new MockSpeechModelV2({
      doGenerate: async () => ({
        audio: new Uint8Array([1, 2, 3]),
        warnings: [],
        request: {},
        response,
      }),
    });
    const service = new SpeechService(
      registryWith({ getSpeechModel: () => model }),
    );
    const result = await service.generate('hello', { voice: 'alloy' });
    expect(result.audio).toBeDefined();
  });
});

describe('TranscriptionService', () => {
  it('transcribes audio', async () => {
    const model = new MockTranscriptionModelV2({
      doGenerate: async () => ({
        text: 'hello world',
        segments: [],
        language: 'en',
        durationInSeconds: 1,
        warnings: [],
        response,
      }),
    });
    const service = new TranscriptionService(
      registryWith({ getTranscriptionModel: () => model }),
    );
    const result = await service.transcribe(new Uint8Array([0, 1, 2]));
    expect(result.text).toBe('hello world');
  });
});
