import { describe, expect, it, vi } from 'vitest';
import { streamAgentToSocket } from './stream-to-socket.js';

function textStream(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        yield c;
      }
    },
  };
}

describe('streamAgentToSocket', () => {
  it('emits a chunk per delta then done with the full text', async () => {
    const emit = vi.fn();
    const text = await streamAgentToSocket(
      { textStream: textStream(['Hello', ' world']) },
      { emit },
    );
    expect(text).toBe('Hello world');
    expect(emit).toHaveBeenNthCalledWith(1, 'agent:chunk', { delta: 'Hello' });
    expect(emit).toHaveBeenNthCalledWith(2, 'agent:chunk', { delta: ' world' });
    expect(emit).toHaveBeenNthCalledWith(3, 'agent:done', {
      text: 'Hello world',
    });
  });

  it('emits error and rethrows on failure', async () => {
    const emit = vi.fn();
    const failing = {
      textStream: {
        async *[Symbol.asyncIterator]() {
          yield 'a';
          throw new Error('boom');
        },
      },
    };
    await expect(streamAgentToSocket(failing, { emit })).rejects.toThrow(
      'boom',
    );
    expect(emit).toHaveBeenCalledWith('agent:error', { message: 'boom' });
  });

  it('honors custom event names', async () => {
    const emit = vi.fn();
    await streamAgentToSocket(
      { textStream: textStream(['x']) },
      { emit },
      {
        chunkEvent: 'c',
        doneEvent: 'd',
      },
    );
    expect(emit).toHaveBeenCalledWith('c', { delta: 'x' });
    expect(emit).toHaveBeenCalledWith('d', { text: 'x' });
  });
});
