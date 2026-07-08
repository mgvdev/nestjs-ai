/** Minimal socket shape (compatible with socket.io's `Socket`). */
export interface SocketLike {
  emit(event: string, payload?: unknown): void;
}

/** A stream result exposing a text stream (from agent `.stream()`). */
export interface TextStreamLike {
  textStream: AsyncIterable<string>;
}

export interface StreamToSocketOptions {
  chunkEvent?: string;
  doneEvent?: string;
  errorEvent?: string;
}

/**
 * Forwards an agent text stream to a socket: emits `chunkEvent` per delta, then
 * `doneEvent` with the full text; emits `errorEvent` and rethrows on failure.
 * Framework-agnostic — the WebSocket gateway is thin glue over this.
 */
export async function streamAgentToSocket(
  stream: TextStreamLike,
  socket: SocketLike,
  options: StreamToSocketOptions = {},
): Promise<string> {
  const chunkEvent = options.chunkEvent ?? 'agent:chunk';
  const doneEvent = options.doneEvent ?? 'agent:done';
  const errorEvent = options.errorEvent ?? 'agent:error';

  try {
    let text = '';
    for await (const delta of stream.textStream) {
      text += delta;
      socket.emit(chunkEvent, { delta });
    }
    socket.emit(doneEvent, { text });
    return text;
  } catch (error) {
    socket.emit(errorEvent, {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
