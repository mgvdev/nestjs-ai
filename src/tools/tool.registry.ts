import { Injectable, type OnModuleInit, type Type } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { tool, type Tool as AiTool, type ToolSet } from 'ai';
import { TOOL_METADATA } from '../ai.constants.js';
import type { ToolMetadata } from './tool.metadata.js';

/** A discovered tool together with the class that declared it. */
export interface ToolEntry {
  name: string;
  tool: AiTool<any, any>;
  target: Type<any>;
}

/** A tool reference accepted by `buildToolSet`: a provider class or a name. */
export type ToolRef = Type<any> | string;

/**
 * Discovers every `@Tool`-decorated method across the application's providers
 * and wraps each into a Vercel AI SDK `tool()` whose `execute` calls the method
 * on its DI-managed instance (preserving `this` and injected dependencies).
 */
@Injectable()
export class ToolRegistry implements OnModuleInit {
  private readonly tools = new Map<string, ToolEntry>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') {
        continue;
      }
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) {
        continue;
      }
      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const methodRef = instance[methodName];
        const metadata = this.reflector.get<ToolMetadata | undefined>(
          TOOL_METADATA,
          methodRef,
        );
        if (!metadata) {
          continue;
        }
        this.register(instance, methodName, metadata);
      }
    }
  }

  private register(
    instance: any,
    methodName: string,
    metadata: ToolMetadata,
  ): void {
    const name = metadata.name ?? methodName;
    if (this.tools.has(name)) {
      throw new Error(
        `Duplicate AI tool name "${name}". Tool names must be unique across ` +
          `all providers (declared on ${instance.constructor?.name}).`,
      );
    }
    const built = tool({
      description: metadata.description,
      inputSchema: metadata.schema,
      execute: async (args: unknown, opts: unknown) =>
        instance[methodName](args, opts),
    });
    this.tools.set(name, {
      name,
      tool: built,
      target: instance.constructor,
    });
  }

  /** Returns the tool registered under `name`, if any. */
  getByName(name: string): ToolEntry | undefined {
    return this.tools.get(name);
  }

  /** Returns every tool declared by the given provider class. */
  getForClass(target: Type<any>): ToolEntry[] {
    return [...this.tools.values()].filter((entry) => entry.target === target);
  }

  /** Returns all discovered tools. */
  getAll(): ToolEntry[] {
    return [...this.tools.values()];
  }

  /**
   * Builds the `ToolSet` passed to `generateText`/`streamText` from a list of
   * tool references (provider classes and/or tool names). Passing no refs
   * returns every discovered tool.
   */
  buildToolSet(refs?: ToolRef[]): ToolSet {
    const entries =
      refs && refs.length > 0
        ? refs.flatMap((ref) => this.resolveRef(ref))
        : this.getAll();

    const set: ToolSet = {};
    for (const entry of entries) {
      set[entry.name] = entry.tool;
    }
    return set;
  }

  private resolveRef(ref: ToolRef): ToolEntry[] {
    if (typeof ref === 'string') {
      const entry = this.getByName(ref);
      if (!entry) {
        throw new Error(`Unknown AI tool "${ref}".`);
      }
      return [entry];
    }
    const entries = this.getForClass(ref);
    if (entries.length === 0) {
      throw new Error(
        `Class "${ref.name}" declares no @Tool methods, or was not registered ` +
          `as a provider so it could be discovered.`,
      );
    }
    return entries;
  }
}
