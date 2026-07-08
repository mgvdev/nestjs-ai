import { Injectable } from '@nestjs/common';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { ProviderRegistry } from '../core/provider-registry.js';

export interface GenerateSpeechOptions {
  /** Speech model id, e.g. `"openai:tts-1"`. Defaults to `defaultSpeechModel`. */
  model?: string;
  /** Voice identifier (provider-specific). */
  voice?: string;
  /** Output audio format, e.g. `"mp3"`. */
  outputFormat?: string;
  /** Extra guidance for the synthesis. */
  instructions?: string;
  speed?: number;
  language?: string;
  providerOptions?: Record<string, Record<string, any>>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
}

/**
 * Synthesizes speech from text. Wraps the Vercel AI SDK's
 * `experimental_generateSpeech`. Result exposes `.audio`.
 */
@Injectable()
export class SpeechService {
  constructor(private readonly providers: ProviderRegistry) {}

  generate(text: string, options: GenerateSpeechOptions = {}) {
    const { model, ...rest } = options;
    return generateSpeech({
      model: this.providers.getSpeechModel(model),
      text,
      ...rest,
    });
  }
}
