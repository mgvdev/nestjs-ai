import { Injectable } from '@nestjs/common';
import {
  interpolate,
  type PromptDefinition,
} from './prompt.types.js';

/** Marker for the unversioned entry of a prompt. */
const DEFAULT_VERSION = '__default__';

/**
 * In-memory registry of named, versioned prompt templates. Register prompts via
 * `AiModule.forRoot({ prompts })`, `AiModule.forFeature({ prompts })`, or
 * imperatively, then `render(name, vars)` to produce a final string.
 */
@Injectable()
export class PromptRegistry {
  /** name -> (version -> definition) */
  private readonly prompts = new Map<string, Map<string, PromptDefinition>>();
  /** name -> most recently registered version key */
  private readonly latest = new Map<string, string>();

  /** Registers a prompt. Throws on a duplicate (name, version). */
  register(definition: PromptDefinition): void {
    const versions =
      this.prompts.get(definition.name) ?? new Map<string, PromptDefinition>();
    const versionKey = definition.version ?? DEFAULT_VERSION;
    if (versions.has(versionKey)) {
      throw new Error(
        `Prompt "${definition.name}"${
          definition.version ? ` version "${definition.version}"` : ''
        } is already registered.`,
      );
    }
    versions.set(versionKey, definition);
    this.prompts.set(definition.name, versions);
    this.latest.set(definition.name, versionKey);
  }

  /** Registers many prompts. */
  registerAll(definitions: PromptDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  /** Returns a prompt definition (latest version when `version` omitted). */
  get(name: string, version?: string): PromptDefinition {
    const versions = this.prompts.get(name);
    if (!versions) {
      throw new Error(`Unknown prompt "${name}".`);
    }
    const versionKey = version ?? this.latest.get(name) ?? DEFAULT_VERSION;
    const definition = versions.get(versionKey);
    if (!definition) {
      throw new Error(`Unknown version "${version}" for prompt "${name}".`);
    }
    return definition;
  }

  /** Renders a prompt to a string, interpolating `{{var}}` placeholders. */
  render(
    name: string,
    vars: Record<string, unknown> = {},
    options: { version?: string } = {},
  ): string {
    return interpolate(this.get(name, options.version).template, vars);
  }

  /** Whether a prompt (any version) is registered. */
  has(name: string): boolean {
    return this.prompts.has(name);
  }
}
