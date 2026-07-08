import { Injectable } from '@nestjs/common';
import { AgentRegistry } from '../agent/orchestration/agent-registry.js';
import type { AgentResult } from '../agent/agent.interface.js';
import type { AgentJobData } from './agent-job.types.js';

/**
 * Runs a queued agent job by resolving the agent from the {@link AgentRegistry}
 * and invoking its `.run()`. Framework-agnostic: a BullMQ worker simply calls
 * `run(job.data)`.
 */
@Injectable()
export class AgentJobProcessor {
  constructor(private readonly agents: AgentRegistry) {}

  async run(data: AgentJobData): Promise<AgentResult> {
    const agent = this.agents.get(data.agent);
    if (!agent) {
      throw new Error(
        `Cannot process job: unknown agent "${data.agent}". Is it registered?`,
      );
    }
    return agent.run(data.input, data.options);
  }
}
