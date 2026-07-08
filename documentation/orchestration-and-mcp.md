# Orchestration & MCP

## Multi-agent orchestration

Reference an `@Agent` class in another agent's `tools` to delegate to it
(supervisor / handoff). The sub-agent's output text is returned to the caller.

```ts
@Agent({ model: 'openai:gpt-4o', system: 'Research facts.' })
export class ResearchAgent extends AiAgent {}

@Agent({ model: 'openai:gpt-4o', system: 'Write the final answer.' })
export class WriterAgent extends AiAgent {}

@Agent({
  model: 'openai:gpt-4o',
  system: 'Coordinate specialists to answer the user.',
  tools: [ResearchAgent, WriterAgent],   // sub-agents used as tools
})
export class SupervisorAgent extends AiAgent {}
```

Register all three as providers. The supervisor calls each sub-agent by its class
name.

### `AgentRegistry`

Indexes all agents by class name — used by orchestration and background jobs.

```ts
this.agents.get('ResearchAgent');   // instance
this.agents.all();                  // AgentEntry[]
```

### `createAgentTool`

Wrap an agent as a tool manually:

```ts
import { createAgentTool } from '@mgvdev/nestjs-ai';
const tool = createAgentTool(researchAgent, { name: 'research', description: '…' });
```

## MCP (Model Context Protocol)

Adapt tools from an MCP server into an agent tool set. Bring your own client from
`@modelcontextprotocol/sdk` — any object with `listTools` / `callTool` / `close`.

```ts
import { McpService } from '@mgvdev/nestjs-ai';

// connect once (e.g. on module init)
const toolSet = await this.mcp.connect('filesystem', mcpClient);

// use the tools
await this.ai.generateText({ model: 'openai:gpt-4o', tools: toolSet, prompt });

// or fetch later / merge
this.mcp.getToolSet('filesystem');
this.mcp.getAllTools();
```

Clients are closed automatically on module destroy. MCP tools are exposed to the
model via the AI SDK's `dynamicTool`, with input schemas passed through from the
server's JSON schema.

> AI SDK v7 does not ship an MCP client; use `@modelcontextprotocol/sdk` directly
> to construct the transport + client, then hand it to `McpService`.
