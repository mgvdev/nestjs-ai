/**
 * WebSocket gateway for realtime agent streaming. Published as
 * `@mgvdev/nestjs-ai/websocket` because it statically imports
 * `@nestjs/websockets` (optional peers). The pure `streamAgentToSocket` helper
 * is available from the main entry.
 */
export {
  AgentGateway,
  type AgentRunMessage,
} from './websocket/agent.gateway.js';
export {
  streamAgentToSocket,
  type SocketLike,
  type TextStreamLike,
  type StreamToSocketOptions,
} from './websocket/stream-to-socket.js';
