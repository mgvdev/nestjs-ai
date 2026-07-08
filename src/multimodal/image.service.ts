import { Injectable } from '@nestjs/common';
import { experimental_generateImage as generateImage } from 'ai';
import { ProviderRegistry } from '../core/provider-registry.js';

export interface GenerateImageOptions {
  /** Image model id, e.g. `"openai:dall-e-3"`. Defaults to `defaultImageModel`. */
  model?: string;
  /** Number of images to generate. */
  n?: number;
  /** Size string, e.g. `"1024x1024"`. */
  size?: `${number}x${number}`;
  /** Aspect ratio, e.g. `"16:9"`. */
  aspectRatio?: `${number}:${number}`;
  seed?: number;
  providerOptions?: Record<string, Record<string, any>>;
  abortSignal?: AbortSignal;
  maxRetries?: number;
}

/**
 * Generates images from a text prompt. Wraps the Vercel AI SDK's
 * `experimental_generateImage`. Result exposes `.image` and `.images`.
 */
@Injectable()
export class ImageService {
  constructor(private readonly providers: ProviderRegistry) {}

  generate(prompt: string, options: GenerateImageOptions = {}) {
    const { model, ...rest } = options;
    return generateImage({
      model: this.providers.getImageModel(model),
      prompt,
      ...rest,
    });
  }
}
