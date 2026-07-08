import { Inject, Injectable, Optional } from '@nestjs/common';

/** Minimal shape of `EventEmitter2` from `@nestjs/event-emitter`. */
export interface EventEmitterLike {
  emit(event: string, payload: unknown): boolean;
}

/** Injection token for an optional event emitter (EventEmitter2). */
export const EVENT_EMITTER = Symbol('AI_EVENT_EMITTER');

/**
 * Emits library events through `@nestjs/event-emitter`'s `EventEmitter2` when
 * it is available, and is a no-op otherwise. This keeps `@nestjs/event-emitter`
 * a truly optional peer dependency.
 */
@Injectable()
export class AiEventEmitter {
  constructor(
    @Optional()
    @Inject(EVENT_EMITTER)
    private readonly emitter?: EventEmitterLike | undefined,
  ) {}

  emit(event: string, payload: unknown): void {
    this.emitter?.emit(event, payload);
  }

  /** Whether an underlying emitter is wired up. */
  get enabled(): boolean {
    return this.emitter != null;
  }
}
