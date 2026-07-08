import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { AiModule } from './ai.module.js';
import { AI_CACHE, APPROVAL_GATE } from './ai.constants.js';
import { Tool } from './tools/tool.decorator.js';
import { ToolRegistry } from './tools/tool.registry.js';
import { AgentRegistry } from './agent/orchestration/agent-registry.js';
import { McpService } from './mcp/mcp.service.js';
import { InMemoryAiCache } from './cache/in-memory-ai-cache.js';
import { DenyApproveGate } from './approval/approval-gates.js';

@Injectable()
class DangerTools {
  ran = false;

  @Tool({
    description: 'Wipe the database',
    schema: z.object({}),
    requiresApproval: true,
  })
  wipe() {
    this.ran = true;
    return 'wiped';
  }
}

describe('phase 3 module wiring', () => {
  it('wires cache, approval gate, MCP and agent registry from options', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          providers: { openai: { apiKey: 'test' } },
          cache: InMemoryAiCache,
          approvalGate: DenyApproveGate,
        }),
      ],
      providers: [DangerTools],
    }).compile();
    await moduleRef.init();

    // Optional services + tokens resolve.
    expect(moduleRef.get(McpService)).toBeInstanceOf(McpService);
    expect(moduleRef.get(AgentRegistry)).toBeInstanceOf(AgentRegistry);
    expect(moduleRef.get(AI_CACHE)).toBeInstanceOf(InMemoryAiCache);
    expect(moduleRef.get(APPROVAL_GATE)).toBeInstanceOf(DenyApproveGate);

    // The configured deny-gate blocks the requiresApproval tool end-to-end.
    const registry = moduleRef.get(ToolRegistry);
    const danger = moduleRef.get(DangerTools);
    await expect(
      registry.getByName('wipe')!.tool.execute!({}, {} as any),
    ).rejects.toThrow(/denied by the approval gate/);
    expect(danger.ran).toBe(false);
    await moduleRef.close();
  });

  it('omits optional tokens when not configured', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AiModule.forRoot({ providers: { openai: { apiKey: 'test' } } })],
    }).compile();
    await moduleRef.init();
    // AI_CACHE / APPROVAL_GATE are not registered unless configured.
    expect(() => moduleRef.get(AI_CACHE, { strict: false })).toThrow();
    await moduleRef.close();
  });
});
