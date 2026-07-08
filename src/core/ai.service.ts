import { Injectable } from '@nestjs/common';
import {
  generateObject,
  generateText,
  streamObject,
  streamText,
} from 'ai';
import { ProviderRegistry } from './provider-registry.js';
import { ToolRegistry, type ToolRef } from '../tools/tool.registry.js';

/** Replaces `model` (a resolvable id) and `tools` (tool refs) on SDK params. */
type NestAiParams<Fn extends (arg: any) => any> = Omit<
  Parameters<Fn>[0],
  'model' | 'tools'
> & {
  /** Model id string (e.g. `"openai:gpt-4o"`); defaults to the module model. */
  model?: string;
  /** Tool references (provider classes and/or names) to expose to the model. */
  tools?: ToolRef[];
};

/**
 * Thin, DI-friendly facade over the Vercel AI SDK generation functions for
 * callers that don't want to declare an `@Agent` class. Resolves `model`
 * strings and `tools` references, then forwards everything else unchanged.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  generateText(params: NestAiParams<typeof generateText>) {
    return generateText(this.resolve(params) as Parameters<typeof generateText>[0]);
  }

  streamText(params: NestAiParams<typeof streamText>) {
    return streamText(this.resolve(params) as Parameters<typeof streamText>[0]);
  }

  generateObject(params: NestAiParams<typeof generateObject>) {
    return generateObject(this.resolve(params) as Parameters<typeof generateObject>[0]);
  }

  streamObject(params: NestAiParams<typeof streamObject>) {
    return streamObject(this.resolve(params) as Parameters<typeof streamObject>[0]);
  }

  private resolve(params: { model?: string; tools?: ToolRef[] } & Record<string, unknown>) {
    const { model, tools, ...rest } = params;
    return {
      ...rest,
      model: this.providers.getLanguageModel(model),
      ...(tools ? { tools: this.toolRegistry.buildToolSet(tools) } : {}),
    };
  }
}
