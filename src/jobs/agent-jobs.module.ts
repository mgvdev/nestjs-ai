import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AGENT_QUEUE } from '../ai.constants.js';
import { AgentQueueService, AGENT_JOB_NAME } from './agent-queue.service.js';
import { AgentJobProcessor } from './agent-job.processor.js';

const AGENT_JOBS_OPTIONS = Symbol('AGENT_JOBS_OPTIONS');

export interface AgentJobsOptions {
  /** BullMQ connection (ioredis connection or options). */
  connection: unknown;
  /** Queue name (default `"ai-agent-runs"`). */
  queueName?: string;
  /** Start a worker in this process to consume jobs (default `true`). */
  runWorker?: boolean;
}

const DEFAULT_QUEUE = 'ai-agent-runs';

/** Loads `bullmq` at runtime without a compile-time dependency. */
async function loadBullMq(): Promise<any> {
  const specifier = 'bullmq';
  return import(specifier);
}

/**
 * Runs a BullMQ worker that processes queued agent jobs via
 * {@link AgentJobProcessor}. Started on module init, stopped on destroy.
 */
@Injectable()
class AgentWorkerManager implements OnModuleInit, OnModuleDestroy {
  private worker: { close(): Promise<void> } | undefined;

  constructor(
    @Inject(AGENT_JOBS_OPTIONS) private readonly options: AgentJobsOptions,
    private readonly processor: AgentJobProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.options.runWorker === false) {
      return;
    }
    const { Worker } = await loadBullMq();
    this.worker = new Worker(
      this.options.queueName ?? DEFAULT_QUEUE,
      async (job: { name: string; data: any }) => {
        if (job.name === AGENT_JOB_NAME) {
          return this.processor.run(job.data);
        }
        return undefined;
      },
      { connection: this.options.connection },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}

/**
 * Background-job module for asynchronous agent execution on BullMQ. Import it
 * where you need it (it is separate from the global `AiModule`).
 *
 * @example
 * ```ts
 * AgentJobsModule.forRoot({ connection: { host: 'localhost', port: 6379 } })
 * ```
 * Requires the optional peers `bullmq` (and typically a Redis instance).
 */
@Module({})
export class AgentJobsModule {
  static forRoot(options: AgentJobsOptions): DynamicModule {
    return {
      module: AgentJobsModule,
      providers: [
        { provide: AGENT_JOBS_OPTIONS, useValue: options },
        {
          provide: AGENT_QUEUE,
          useFactory: async () => {
            const { Queue } = await loadBullMq();
            return new Queue(options.queueName ?? DEFAULT_QUEUE, {
              connection: options.connection,
            });
          },
        },
        AgentQueueService,
        AgentJobProcessor,
        AgentWorkerManager,
      ],
      exports: [AgentQueueService, AgentJobProcessor],
    };
  }
}
