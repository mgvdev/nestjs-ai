import { Inject, Injectable } from '@nestjs/common';
import { AGENT_QUEUE } from '../ai.constants.js';
import type { AgentJobData, QueueLike } from './agent-job.types.js';

/** The job name used for queued agent runs. */
export const AGENT_JOB_NAME = 'agent-run';

/**
 * Enqueues agent runs onto a BullMQ queue for asynchronous processing. The
 * queue is injected under the `AGENT_QUEUE` token by `AgentJobsModule`.
 */
@Injectable()
export class AgentQueueService {
  constructor(@Inject(AGENT_QUEUE) private readonly queue: QueueLike) {}

  /** Enqueues an agent run and returns the created job id. */
  async enqueue(
    data: AgentJobData,
    jobOptions?: Record<string, unknown>,
  ): Promise<string | undefined> {
    const job = await this.queue.add(AGENT_JOB_NAME, data, jobOptions);
    return job.id;
  }
}
