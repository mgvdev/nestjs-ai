import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';

/** A listed MCP tool (subset of the MCP `tools/list` result we use). */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

/** Result of an MCP `tools/call` (subset). */
export interface McpCallResult {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
  [k: string]: unknown;
}

/**
 * Structural interface for an MCP client (e.g. `Client` from
 * `@modelcontextprotocol/sdk`). Kept structural so this library has no
 * compile-time dependency on the SDK and can be tested with a fake.
 */
export interface McpClientLike {
  listTools(): Promise<{ tools: McpToolInfo[] }>;
  callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<McpCallResult>;
  close?(): Promise<void>;
}

/**
 * Connects to MCP servers and adapts their tools into AI SDK tool sets that
 * agents can use. Register a connected client via `connect(name, client)`, then
 * reference its tools with `getToolSet(name)`.
 */
@Injectable()
export class McpService implements OnModuleDestroy {
  private readonly clients = new Map<string, McpClientLike>();
  private readonly toolSets = new Map<string, ToolSet>();

  /**
   * Registers an MCP client under `name`, lists its tools, and builds a
   * matching AI SDK tool set. Returns the tool set.
   */
  async connect(name: string, client: McpClientLike): Promise<ToolSet> {
    const { tools } = await client.listTools();
    const set: ToolSet = {};
    for (const info of tools) {
      set[info.name] = dynamicTool({
        description: info.description ?? info.name,
        inputSchema: jsonSchema(info.inputSchema as any),
        execute: async (args: unknown) => {
          const result = await client.callTool({
            name: info.name,
            arguments: (args ?? {}) as Record<string, unknown>,
          });
          return extractText(result);
        },
      });
    }
    this.clients.set(name, client);
    this.toolSets.set(name, set);
    return set;
  }

  /** Returns the tool set for a connected server (empty if unknown). */
  getToolSet(name: string): ToolSet {
    return this.toolSets.get(name) ?? {};
  }

  /** Returns tool sets for all connected servers, merged. */
  getAllTools(): ToolSet {
    return Object.assign({}, ...this.toolSets.values());
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeAll();
  }

  /** Closes every connected client. */
  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close?.();
    }
    this.clients.clear();
    this.toolSets.clear();
  }
}

/** Flattens an MCP call result's content into a string. */
function extractText(result: McpCallResult): string {
  if (!result.content) {
    return '';
  }
  return result.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}
