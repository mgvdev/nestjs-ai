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
import {
  type AiInput,
  type AiMessage,
  toMessages,
} from '../messages/message.types.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { AiEventEmitter } from '../observability/ai-event-emitter.js';
import { AI_EVENTS } from '../observability/ai-events.js';
import { GuardrailRegistry } from '../observability/guardrail.registry.js';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import { PromptRegistry } from '../prompts/prompt-registry.service.js';
import { UsageTracker } from '../usage/usage-tracker.service.js';
import { BudgetPolicy } from '../usage/budget-policy.service.js';
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
    @Optional() private readonly budgetPolicy?: BudgetPolicy,
    @Optional() private readonly semanticMemory?: SemanticMemory,
  ) {}

  /** Runs an agent to completion and returns its result. */
  async run<T = unknown>(
    agent: object,
    input: AiInput,
    opts: AgentRunOptions = {},
  ): Promise<AgentResult<T>> {
    try {
      const { agentName, ctx, meta, model, newMessages, system } =
        await this.prepareRun(agent, input, opts);
      const schema = opts.schema ?? meta.output;
      const maxSteps = this.resolveMaxSteps(opts, meta);

      const result = schema
        ? await this.runObject<T>(
            model,
            system,
            ctx.messages,
            schema,
            opts,
            newMessages,
          )
        : await this.runText<T>(
            model,
            system,
            ctx.messages,
            meta,
            maxSteps,
            opts,
            newMessages,
          );

      this.usageTracker?.record({
        model: (model as { modelId?: string }).modelId ?? 'unknown',
        usage: result.usage,
        conversationId: opts.conversationId,
        agent: agentName,
      });

      await this.budgetPolicy?.afterRunBudget(agent, ctx, result);
      await this.guardrails?.runAfterRun(ctx, result);
      this.events?.emit(AI_EVENTS.agentRunFinish, {
        agent: agentName,
        result,
      });
      return result;
    } catch (error) {
      this.events?.emit(AI_EVENTS.agentRunError, {
        agent: agent.constructor?.name ?? 'AiAgent',
        error,
      });
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
      allowSystemInMessages: true,
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
      allowSystemInMessages: true,
      tools: this.toolRegistry.buildToolSet(meta.tools),
      stopWhen: stepCountIs(maxSteps),
      abortSignal: opts.abortSignal,
      temperature: opts.temperature,
      maxRetries: opts.maxRetries ?? this.options.maxRetries,
      experimental_telemetry: this.telemetry(),
    });
    await this.persist(
      opts.conversationId,
      newMessages,
      result.response.messages,
    );
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
   * callers can await it before piping it to an HTTP response or iterating
   * `textStream`.
   * Conversation persistence happens on stream finish.
   */
  async stream(
    agent: object,
    input: AiInput,
    opts: AgentRunOptions = {},
  ): Promise<ReturnType<typeof streamText> | ReturnType<typeof streamObject>> {
    const agentName = agent.constructor?.name ?? 'AiAgent';

    try {
      const prepared = await this.prepareRun(agent, input, opts);
      const { ctx, meta, model, newMessages, system } = prepared;
      const modelId = (model as { modelId?: string }).modelId ?? 'unknown';
      const schema = opts.schema ?? meta.output;
      const maxSteps = this.resolveMaxSteps(opts, meta);
      let streamFailed = false;
      let errorReported = false;
      const reportErrorOnce = (error: unknown): void => {
        streamFailed = true;
        if (errorReported) {
          return;
        }
        errorReported = true;
        this.events?.emit(AI_EVENTS.agentRunError, {
          agent: prepared.agentName,
          error,
        });
      };

      if (schema) {
        return streamObject({
          model,
          system,
          messages: ctx.messages,
          allowSystemInMessages: true,
          schema,
          abortSignal: opts.abortSignal,
          temperature: opts.temperature,
          maxRetries: opts.maxRetries ?? this.options.maxRetries,
          experimental_telemetry: this.telemetry(),
          onError: ({ error }) => {
            reportErrorOnce(error);
          },
          onFinish: async ({ object, usage, error }) => {
            if (object === undefined) {
              reportErrorOnce(
                error ??
                  new Error('Structured stream completed without an object.'),
              );
              return;
            }
            if (streamFailed) {
              return;
            }
            const result: AgentResult = {
              text: '',
              object,
              usage,
              messages: [],
            };
            try {
              await this.completeRun(agent, ctx, modelId, result, newMessages, [
                { role: 'assistant', content: JSON.stringify(object) },
              ]);
            } catch (error) {
              reportErrorOnce(error);
            }
          },
        });
      }

      return streamText({
        model,
        system,
        messages: ctx.messages,
        allowSystemInMessages: true,
        tools: this.toolRegistry.buildToolSet(meta.tools),
        stopWhen: stepCountIs(maxSteps),
        abortSignal: opts.abortSignal,
        temperature: opts.temperature,
        maxRetries: opts.maxRetries ?? this.options.maxRetries,
        experimental_telemetry: this.telemetry(),
        onError: ({ error }) => {
          reportErrorOnce(error);
        },
        onFinish: async ({
          usage,
          finishReason,
          steps,
          toolCalls,
          text,
          responseMessages,
        }) => {
          if (streamFailed) {
            return;
          }
          const result: AgentResult = {
            text,
            steps,
            toolCalls,
            usage,
            finishReason,
            messages: responseMessages,
          };
          try {
            await this.completeRun(
              agent,
              ctx,
              modelId,
              result,
              newMessages,
              responseMessages,
            );
          } catch (error) {
            reportErrorOnce(error);
          }
        },
      });
    } catch (error) {
      this.events?.emit(AI_EVENTS.agentRunError, {
        agent: agentName,
        error,
      });
      throw error;
    }
  }

  private async prepareRun(
    agent: object,
    input: AiInput,
    opts: AgentRunOptions,
  ) {
    const meta = this.readMetadata(agent);
    const agentName = agent.constructor?.name ?? 'AiAgent';
    const model = this.providers.getLanguageModel(opts.model ?? meta.model);
    const newMessages = toMessages(input);
    const history = await this.loadHistory(opts.conversationId);
    const system = await this.resolveSystemWithRecall(opts, meta, input);
    const ctx: GuardrailContext = {
      agent: agentName,
      agentInstance: agent,
      messages: [...history, ...newMessages],
      options: opts,
    };

    this.events?.emit(AI_EVENTS.agentRunStart, {
      agent: agentName,
      input,
      options: opts,
    });
    await this.guardrails?.runBeforeRun(ctx);
    await this.budgetPolicy?.beforeRunBudget(agent, ctx);

    return { agentName, ctx, meta, model, newMessages, system };
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

  private async completeRun(
    agent: object,
    ctx: GuardrailContext,
    model: string,
    result: AgentResult,
    newMessages: ReturnType<typeof toMessages>,
    responseMessages: readonly unknown[] = result.messages,
  ): Promise<void> {
    await this.persist(
      ctx.options.conversationId,
      newMessages,
      responseMessages,
    );
    this.usageTracker?.record({
      model,
      usage: result.usage,
      conversationId: ctx.options.conversationId,
      agent: ctx.agent,
    });
    await this.budgetPolicy?.afterRunBudget(agent, ctx, result);
    await this.guardrails?.runAfterRun(ctx, result);
    this.events?.emit(AI_EVENTS.agentRunFinish, { agent: ctx.agent, result });
    this.events?.emit(AI_EVENTS.streamFinish, { agent: ctx.agent });
  }
}
