import 'reflect-metadata';
import { Inject, Injectable, Optional } from '@nestjs/common';
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
import { type AiInput, type AiMessage, toMessages } from '../messages/message.types.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { AiEventEmitter } from '../observability/ai-event-emitter.js';
import { AI_EVENTS } from '../observability/ai-events.js';
import { GuardrailRegistry } from '../observability/guardrail.registry.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import { PromptRegistry } from '../prompts/prompt-registry.service.js';
import { UsageTracker } from '../usage/usage-tracker.service.js';
import { SemanticMemory } from '../memory/semantic/semantic-memory.service.js';
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
    @Optional() private readonly events?: AiEventEmitter,
    @Optional() private readonly guardrails?: GuardrailRegistry,
    @Optional() private readonly prompts?: PromptRegistry,
    @Optional() private readonly usageTracker?: UsageTracker,
    @Optional() private readonly semanticMemory?: SemanticMemory,
  ) {}

  /** Runs an agent to completion and returns its result. */
  async run<T = unknown>(
    agent: object,
    input: AiInput,
    opts: AgentRunOptions = {},
  ): Promise<AgentResult<T>> {
    const meta = this.readMetadata(agent);
    const agentName = agent.constructor?.name ?? 'AiAgent';
    const model = this.providers.getLanguageModel(opts.model ?? meta.model);
    const system = await this.resolveSystemWithRecall(opts, meta, input);
    const schema = opts.schema ?? meta.output;
    const maxSteps = this.resolveMaxSteps(opts, meta);

    const newMessages = toMessages(input);
    const history = await this.loadHistory(opts.conversationId);
    const ctx: GuardrailContext = {
      agent: agentName,
      messages: [...history, ...newMessages],
      options: opts,
    };

    this.events?.emit(AI_EVENTS.agentRunStart, {
      agent: agentName,
      input,
      options: opts,
    });

    try {
      await this.guardrails?.runBeforeRun(ctx);

      const result = schema
        ? await this.runObject<T>(model, system, ctx.messages, schema, opts, newMessages)
        : await this.runText<T>(model, system, ctx.messages, meta, maxSteps, opts, newMessages);

      this.usageTracker?.record({
        model: (model as { modelId?: string }).modelId ?? 'unknown',
        usage: result.usage,
        conversationId: opts.conversationId,
        agent: agentName,
      });

      await this.guardrails?.runAfterRun(ctx, result);
      this.events?.emit(AI_EVENTS.agentRunFinish, {
        agent: agentName,
        result,
      });
      return result;
    } catch (error) {
      this.events?.emit(AI_EVENTS.agentRunError, { agent: agentName, error });
      throw error;
    }
  }

  private async runObject<T>(
    model: ReturnType<ProviderRegistry['getLanguageModel']>,
    system: string | undefined,
    messages: AiMessage[],
    schema: NonNullable<AgentRunOptions['schema']>,
    opts: AgentRunOptions,
    newMessages: AiMessage[],
  ): Promise<AgentResult<T>> {
    const result = await generateObject({
      model,
      system,
      messages,
      schema,
      abortSignal: opts.abortSignal,
      temperature: opts.temperature,
      maxRetries: opts.maxRetries ?? this.options.maxRetries,
      experimental_telemetry: this.telemetry(),
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

  private async runText<T>(
    model: ReturnType<ProviderRegistry['getLanguageModel']>,
    system: string | undefined,
    messages: AiMessage[],
    meta: AgentOptions,
    maxSteps: number,
    opts: AgentRunOptions,
    newMessages: AiMessage[],
  ): Promise<AgentResult<T>> {
    const result = await generateText({
      model,
      system,
      messages,
      tools: this.toolRegistry.buildToolSet(meta.tools),
      stopWhen: stepCountIs(maxSteps),
      abortSignal: opts.abortSignal,
      temperature: opts.temperature,
      maxRetries: opts.maxRetries ?? this.options.maxRetries,
      experimental_telemetry: this.telemetry(),
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
  stream(
    agent: object,
    input: AiInput,
    opts: AgentRunOptions = {},
  ): ReturnType<typeof streamText> | ReturnType<typeof streamObject> {
    const meta = this.readMetadata(agent);
    const agentName = agent.constructor?.name ?? 'AiAgent';
    const model = this.providers.getLanguageModel(opts.model ?? meta.model);
    const system = this.resolveSystem(opts, meta);
    const schema = opts.schema ?? meta.output;
    const maxSteps = this.resolveMaxSteps(opts, meta);

    const newMessages = toMessages(input);
    this.events?.emit(AI_EVENTS.agentRunStart, {
      agent: agentName,
      input,
      options: opts,
    });

    if (schema) {
      return streamObject({
        model,
        system,
        messages: newMessages,
        schema,
        abortSignal: opts.abortSignal,
        temperature: opts.temperature,
        experimental_telemetry: this.telemetry(),
        onFinish: async ({ object }) => {
          if (object !== undefined) {
            await this.persist(opts.conversationId, newMessages, [
              { role: 'assistant', content: JSON.stringify(object) },
            ]);
          }
          this.events?.emit(AI_EVENTS.streamFinish, { agent: agentName });
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
      maxRetries: opts.maxRetries ?? this.options.maxRetries,
      experimental_telemetry: this.telemetry(),
      onFinish: async ({ response }) => {
        await this.persist(opts.conversationId, newMessages, response.messages);
        this.events?.emit(AI_EVENTS.streamFinish, { agent: agentName });
      },
    });
  }

  /** Resolves the system prompt and prepends recalled memory when requested. */
  private async resolveSystemWithRecall(
    opts: AgentRunOptions,
    meta: AgentOptions,
    input: AiInput,
  ): Promise<string | undefined> {
    let system = this.resolveSystem(opts, meta);
    if (opts.recall && opts.conversationId && this.semanticMemory) {
      const query =
        opts.recall.query ?? (typeof input === 'string' ? input : '');
      if (query) {
        const snippets = await this.semanticMemory.recall(
          opts.conversationId,
          query,
          { topK: opts.recall.topK },
        );
        if (snippets.length > 0) {
          const context = snippets.map((s) => s.content).join('\n');
          system = [system, `Relevant context from memory:\n${context}`]
            .filter(Boolean)
            .join('\n\n');
        }
      }
    }
    return system;
  }

  private resolveSystem(
    opts: AgentRunOptions,
    meta: AgentOptions,
  ): string | undefined {
    if (opts.systemPrompt) {
      if (!this.prompts) {
        throw new Error(
          'systemPrompt requires the PromptRegistry (AiModule must be imported).',
        );
      }
      return this.prompts.render(
        opts.systemPrompt.name,
        opts.systemPrompt.vars,
        { version: opts.systemPrompt.version },
      );
    }
    return opts.system ?? meta.system;
  }

  private telemetry() {
    const t = this.options.telemetry;
    if (!t?.isEnabled) {
      return undefined;
    }
    return { isEnabled: true, functionId: t.functionId };
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
