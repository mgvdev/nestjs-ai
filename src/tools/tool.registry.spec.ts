import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { Tool } from './tool.decorator.js';
import { ToolRegistry } from './tool.registry.js';

@Injectable()
class MathTools {
  @Tool({ description: 'Add two numbers', schema: z.object({ a: z.number(), b: z.number() }) })
  add({ a, b }: { a: number; b: number }) {
    return a + b;
  }

  @Tool({
    name: 'multiply',
    description: 'Multiply two numbers',
    schema: z.object({ a: z.number(), b: z.number() }),
  })
  mul({ a, b }: { a: number; b: number }) {
    return a * b;
  }

  notATool() {
    return 'ignored';
  }
}

async function bootstrap() {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [ToolRegistry, MathTools],
  }).compile();
  await moduleRef.init();
  return moduleRef.get(ToolRegistry);
}

describe('ToolRegistry', () => {
  it('discovers @Tool methods and honors custom names', async () => {
    const registry = await bootstrap();
    const names = registry.getAll().map((t) => t.name).sort();
    expect(names).toEqual(['add', 'multiply']);
  });

  it('builds a tool set from a provider class', async () => {
    const registry = await bootstrap();
    const set = registry.buildToolSet([MathTools]);
    expect(Object.keys(set).sort()).toEqual(['add', 'multiply']);
  });

  it('builds a tool set from tool names', async () => {
    const registry = await bootstrap();
    const set = registry.buildToolSet(['add']);
    expect(Object.keys(set)).toEqual(['add']);
  });

  it('executes the tool against its DI instance', async () => {
    const registry = await bootstrap();
    const entry = registry.getByName('add')!;
    const result = await entry.tool.execute!({ a: 2, b: 3 }, {} as any);
    expect(result).toBe(5);
  });

  it('throws on an unknown tool reference', async () => {
    const registry = await bootstrap();
    expect(() => registry.buildToolSet(['nope'])).toThrowError(/Unknown AI tool/);
  });
});
