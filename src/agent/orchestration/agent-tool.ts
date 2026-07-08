import { tool, type Tool as AiTool } from 'ai';
import { z, type ZodType } from 'zod';
import type { AiAgent } from '../ai-agent.base.js';

export interface AgentToolOptions {
  /** Tool name exposed to the calling model (default: the agent class name). */
  name?: string;
  /** Description guiding when to delegate to this agent. */
  description?: string;
  /**
   * Input schema. Defaults to `{ input: string }`; the `input` field is passed
   * to the sub-agent's `.run()`.
   */
  inputSchema?: ZodType<any, any, any>;
}

/**
 * Wraps an agent as a tool so another agent can delegate to it (supervisor /
 * handoff patterns). The wrapped agent's `.run()` output text is returned to the
 * caller.
 *
 * @example
 * ```ts
 * @Agent({ model: 'openai:gpt-4o', system: 'Supervisor', tools: [ResearchAgent] })
 * class SupervisorAgent extends AiAgent {}
 * ```
 */
export function createAgentTool(
  agent: Pick<AiAgent, 'run'>,
  options: AgentToolOptions = {},
): AiTool<any, string> {
  const schema =
    options.inputSchema ??
    z.object({
      input: z.string().describe('The task or question for the agent'),
    });

  return tool({
    description:
      options.description ??
      `Delegate the task to the ${options.name ?? 'sub'} agent.`,
    inputSchema: schema,
    execute: async (args: unknown) => {
      const input =
        typeof args === 'string'
          ? args
          : ((args as { input?: string })?.input ?? JSON.stringify(args));
      const result = await agent.run(input);
      return result.text;
    },
  });
}
