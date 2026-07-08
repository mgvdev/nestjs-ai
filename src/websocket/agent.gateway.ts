import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AgentRegistry } from '../agent/orchestration/agent-registry.js';
import {
  streamAgentToSocket,
  type SocketLike,
} from './stream-to-socket.js';

/** Payload for the `agent:run` message. */
export interface AgentRunMessage {
  agent: string;
  input: string;
}

/**
 * WebSocket gateway that streams agent responses over socket.io. Client emits
 * `agent:run { agent, input }`; the server streams `agent:chunk { delta }` then
 * `agent:done { text }`. Requires the optional peers `@nestjs/websockets`,
 * `@nestjs/platform-socket.io`, and `socket.io`.
 *
 * Published under `@mgvdev/nestjs-ai/websocket`.
 */
@WebSocketGateway()
export class AgentGateway {
  constructor(private readonly agents: AgentRegistry) {}

  @SubscribeMessage('agent:run')
  async run(
    @MessageBody() message: AgentRunMessage,
    @ConnectedSocket() client: SocketLike,
  ): Promise<void> {
    const agent = this.agents.get(message.agent);
    if (!agent) {
      client.emit('agent:error', {
        message: `Unknown agent "${message.agent}".`,
      });
      return;
    }
    await streamAgentToSocket(agent.stream(message.input), client);
  }
}
