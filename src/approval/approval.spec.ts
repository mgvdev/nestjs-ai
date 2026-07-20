import { Injectable, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { APPROVAL_GATE } from '../ai.constants.js';
import { Tool } from '../tools/tool.decorator.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { AutoApproveGate, DenyApproveGate } from './approval-gates.js';

@Injectable()
class DangerTools {
  executed = false;

  @Tool({
    description: 'Delete everything',
    schema: z.object({ path: z.string() }),
    requiresApproval: true,
  })
  remove({ path }: { path: string }) {
    this.executed = true;
    return `removed ${path}`;
  }
}

async function bootstrap(gate: Provider) {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [ToolRegistry, DangerTools, gate],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

describe('tool approval', () => {
  it('blocks a requiresApproval tool when the gate denies', async () => {
    const moduleRef = await bootstrap({
      provide: APPROVAL_GATE,
      useClass: DenyApproveGate,
    });
    const registry = moduleRef.get(ToolRegistry);
    const tools = moduleRef.get(DangerTools);

    await expect(
      registry.getByName('remove')!.tool.execute!({ path: '/' }, {} as any),
    ).rejects.toThrow(/denied by the approval gate/);
    expect(tools.executed).toBe(false);
  });

  it('allows the tool when the gate approves', async () => {
    const moduleRef = await bootstrap({
      provide: APPROVAL_GATE,
      useClass: AutoApproveGate,
    });
    const registry = moduleRef.get(ToolRegistry);

    const result = await registry.getByName('remove')!.tool.execute!(
      { path: '/tmp' },
      {} as any,
    );
    expect(result).toBe('removed /tmp');
  });

  it('runs normally when no gate is configured', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [ToolRegistry, DangerTools],
    }).compile();
    await moduleRef.init();
    const registry = moduleRef.get(ToolRegistry);

    const result = await registry.getByName('remove')!.tool.execute!(
      { path: '/x' },
      {} as any,
    );
    expect(result).toBe('removed /x');
  });
});
