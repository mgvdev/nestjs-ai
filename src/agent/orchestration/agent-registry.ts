import { Injectable, type OnModuleInit, type Type } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { AGENT_METADATA } from '../../ai.constants.js';

/** A discovered agent instance and its class. */
export interface AgentEntry {
  name: string;
  instance: any;
  target: Type<any>;
}

/**
 * Indexes every `@Agent`-decorated provider by class name, enabling
 * multi-agent orchestration (supervisor/handoff) and background-job resolution.
 */
@Injectable()
export class AgentRegistry implements OnModuleInit {
  private readonly agents = new Map<string, AgentEntry>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance;
      const ctor = instance?.constructor as Type<any> | undefined;
      if (instance && ctor && Reflect.getMetadata(AGENT_METADATA, ctor)) {
        this.agents.set(ctor.name, { name: ctor.name, instance, target: ctor });
      }
    }
  }

  /** Returns an agent instance by class name. */
  get(name: string): any | undefined {
    return this.agents.get(name)?.instance;
  }

  /** Returns an agent instance by its class. */
  getByClass(target: Type<any>): any | undefined {
    return this.agents.get(target.name)?.instance;
  }

  /** All discovered agents. */
  all(): AgentEntry[] {
    return [...this.agents.values()];
  }
}
