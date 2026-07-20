import { describe, expect, it, vi } from 'vitest';
import { McpService, type McpClientLike } from './mcp.service.js';

function fakeClient(): McpClientLike & { closed: boolean } {
  return {
    closed: false,
    async listTools() {
      return {
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a city',
            inputSchema: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        ],
      };
    },
    async callTool({ name, arguments: args }) {
      return {
        content: [
          { type: 'text', text: `weather in ${(args as any).city}: sunny` },
        ],
      };
    },
    async close() {
      this.closed = true;
    },
  };
}

describe('McpService', () => {
  it('adapts MCP tools into an AI SDK tool set and calls them', async () => {
    const service = new McpService();
    const client = fakeClient();
    const set = await service.connect('weather', client);

    expect(Object.keys(set)).toEqual(['get_weather']);
    const output = await (set.get_weather as any).execute(
      { city: 'Paris' },
      {},
    );
    expect(output).toBe('weather in Paris: sunny');
  });

  it('exposes tool sets by name and merged', async () => {
    const service = new McpService();
    await service.connect('weather', fakeClient());
    expect(Object.keys(service.getToolSet('weather'))).toEqual(['get_weather']);
    expect(Object.keys(service.getAllTools())).toEqual(['get_weather']);
    expect(service.getToolSet('unknown')).toEqual({});
  });

  it('closes clients on closeAll', async () => {
    const service = new McpService();
    const client = fakeClient();
    await service.connect('weather', client);
    await service.closeAll();
    expect(client.closed).toBe(true);
    expect(service.getToolSet('weather')).toEqual({});
  });
});
