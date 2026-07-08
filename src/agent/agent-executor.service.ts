import 'reflect-metadata';
import { Inject, Injectable } from '@nestjs/common';
import {
  generateObject,
  generateText,
  stepCountIs,
  streamObject,
  streamText,
} from 'ai';
import {
  AGENT_METADATA,
  AI_MODULE_OPTIONS,
  CONVERSATION_STORE,
  DEFAULT_MAX_STEPS,
} from '../ai.constants.js';
import type { AiModuleOptions } from '../interfaces/ai-module-options.interface.js';
import type { ConversationStore } from '../memory/conversation-store.interface.js';
import { type AiInput, toMessages } from '../messages/message.types.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import type { AgentOptions } from './agent.metadata.js';
import type { AgentResult, AgentRunOptions } from './agent.interface.js';

/**
 * Runtime that executes `@Agent` classes: resolves their model, tools and
 * memory, then drives the Vercel AI SDK (`generateText` / `streamText`, or the
 * object variants when a structured-output schema is present).
 */
@Injectable()
export class AgentExecutorService {
  constructor(
    private readonly providers: ProviderRegistry,
    private readonly toolRegistry: ToolRegistry,
    @Inject(CONVERSATION_STORE) private readonly store: ConversationStore,
    @Inject(AI_MODULE_OPTIONS) private readonly options: AiModuleOptions,
  ) {}

  /** Runs an agent to completion and returns its result. */
  async run<T = unknown>(
    agent: object,
    input: AiInput,
    opts: AgentRunOptions = {},
  ): Promise<AgentResult<T>> {
    const meta = this.readMetadata(agent);
    const model = this.providers.getLanguageModel(opts.model ?? meta.model);
    const system = opts.system ?? meta.system;
    const schema = opts.schema ?? meta.output;
    const maxSteps = this.resolveMaxSteps(opts, meta);

    const newMessages = toMessages(input);
    const history = await this.loadHistory(opts.conversationId);
    const messages = [...history, ...newMessages];

    if (schema) {
      const result = await generateObject({
        model,
        system,
        messages,
        schema,
        abortSignal: opts.abortSignal,
        temperature: opts.temperature,
      });
      await this.persist(opts.conversationId, newMessages, [
        { role: 'assistant', content: JSON.stringify(result.object) },
      ]);
      return {
        text: '',
        object: result.object as T,
        usage: result.usage,
        finishReason: result.finishReason,
        messages: [],
      };
    }

    const result = await generateText({
      model,
      system,
      messages,
      tools: this.toolRegistry.buildToolSet(meta.tools),
      stopWhen: stepCountIs(maxSteps),
      abortSignal: opts.abortSignal,
      temperature: opts.temperature,
    });
    await this.persist(opts.conversationId, newMessages, result.response.messages);
    return {
      text: result.text,
      steps: result.steps,
      toolCalls: result.toolCalls,
      usage: result.totalUsage,
      finishReason: result.finishReason,
      messages: result.response.messages,
    };
  }

  /**
   * Streams an agent's response. Returns the raw Vercel stream result so
   * controllers can pipe it to an HTTP response or iterate `textStream`.
   * Conversation persistence happens on stream finish.
   */
  stream(agent: object, input: AiInput, opts: AgentRunOptions = {}) {
    const meta = this.readMetadata(agent);
    const model = this.providers.getLanguageModel(opts.model ?? meta.model);
    const system = opts.system ?? meta.system;
    const schema = opts.schema ?? meta.output;
    const maxSteps = this.resolveMaxSteps(opts, meta);

    const newMessages = toMessages(input);

    if (schema) {
      return streamObject({
        model,
        system,
        messages: newMessages,
        schema,
        abortSignal: opts.abortSignal,
        temperature: opts.temperature,
        onFinish: async ({ object }) => {
          if (object !== undefined) {
            await this.persist(opts.conversationId, newMessages, [
              { role: 'assistant', content: JSON.stringify(object) },
            ]);
          }
        },
      });
    }

    return streamText({
      model,
      system,
      messages: newMessages,
      tools: this.toolRegistry.buildToolSet(meta.tools),
      stopWhen: stepCountIs(maxSteps),
      abortSignal: opts.abortSignal,
      temperature: opts.temperature,
      onFinish: async ({ response }) => {
        await this.persist(opts.conversationId, newMessages, response.messages);
      },
    });
  }

  private readMetadata(agent: object): AgentOptions {
    const ctor = (agent as { constructor: unknown }).constructor;
    return (
      (Reflect.getMetadata(AGENT_METADATA, ctor as object) as
        | AgentOptions
        | undefined) ?? {}
    );
  }

  private resolveMaxSteps(opts: AgentRunOptions, meta: AgentOptions): number {
    return (
      opts.maxSteps ??
      meta.maxSteps ??
      this.options.defaultMaxSteps ??
      DEFAULT_MAX_STEPS
    );
  }

  private async loadHistory(conversationId?: string) {
    if (!conversationId) {
      return [];
    }
    return this.store.load(conversationId);
  }

  private async persist(
    conversationId: string | undefined,
    userMessages: ReturnType<typeof toMessages>,
    responseMessages: readonly unknown[],
  ): Promise<void> {
    if (!conversationId) {
      return;
    }
    await this.store.append(conversationId, [
      ...userMessages,
      ...(responseMessages as ReturnType<typeof toMessages>),
    ]);
  }
}
