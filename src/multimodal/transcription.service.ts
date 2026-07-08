import { Injectable } from '@nestjs/common';
import { experimental_transcribe as transcribe } from 'ai';
import { ProviderRegistry } from '../core/provider-registry.js';

/** Audio input accepted by the transcription service. */
export type AudioInput = Uint8Array | ArrayBuffer | Buffer | string | URL;

export interface TranscribeOptions {
  /** Transcription model id, e.g. `"openai:whisper-1"`. */
  model?: string;
  providerOptions?: Record<string, Record<string, any>>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
}

/**
 * Transcribes audio to text. Wraps the Vercel AI SDK's
 * `experimental_transcribe`. Result exposes `.text` and `.segments`.
 */
@Injectable()
export class TranscriptionService {
  constructor(private readonly providers: ProviderRegistry) {}

  transcribe(audio: AudioInput, options: TranscribeOptions = {}) {
    const { model, ...rest } = options;
    return transcribe({
      model: this.providers.getTranscriptionModel(model),
      audio: audio as Parameters<typeof transcribe>[0]['audio'],
      ...rest,
    });
  }
}
