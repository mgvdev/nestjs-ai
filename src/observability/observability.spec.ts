import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AiEventEmitter } from './ai-event-emitter.js';
import { Guardrail } from './guardrail.decorator.js';
import { GuardrailRegistry } from './guardrail.registry.js';
import type {
  Guardrail as GuardrailContract,
  GuardrailContext,
} from './guardrail.interface.js';

describe('AiEventEmitter', () => {
  it('is a no-op without an underlying emitter', () => {
    const emitter = new AiEventEmitter();
    expect(emitter.enabled).toBe(false);
    expect(() => emitter.emit('ai.test', {})).not.toThrow();
  });

  it('forwards to the underlying emitter when present', () => {
    const spy = vi.fn();
    const emitter = new AiEventEmitter({ emit: spy });
    emitter.emit('ai.test', { a: 1 });
    expect(spy).toHaveBeenCalledWith('ai.test', { a: 1 });
  });
});

@Guardrail()
class RecordingGuardrail implements GuardrailContract {
  seen: string[] = [];
  beforeRun(ctx: GuardrailContext): void {
    this.seen.push(ctx.agent);
  }
}

@Guardrail()
class BlockingGuardrail implements GuardrailContract {
  onToolCall(tool: string): void {
    if (tool === 'forbidden') {
      throw new Error('Tool blocked by guardrail');
    }
  }
}

describe('GuardrailRegistry', () => {
  async function bootstrap() {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [GuardrailRegistry, RecordingGuardrail, BlockingGuardrail],
    }).compile();
    await moduleRef.init();
    return moduleRef;
  }

  it('discovers @Guardrail providers and runs beforeRun', async () => {
    const moduleRef = await bootstrap();
    const registry = moduleRef.get(GuardrailRegistry);
    const recorder = moduleRef.get(RecordingGuardrail);

    expect(registry.count).toBe(2);
    await registry.runBeforeRun({
      agent: 'A',
      agentInstance: {},
      messages: [],
      options: {},
    });
    expect(recorder.seen).toEqual(['A']);
  });

  it('lets a guardrail block a tool call', async () => {
    const moduleRef = await bootstrap();
    const registry = moduleRef.get(GuardrailRegistry);

    await expect(registry.runOnToolCall('forbidden', {})).rejects.toThrow(
      /blocked/,
    );
    await expect(
      registry.runOnToolCall('allowed', {}),
    ).resolves.toBeUndefined();
  });
});
