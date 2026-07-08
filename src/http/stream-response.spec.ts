import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { pipeAgentStream } from './stream-response.js';

describe('pipeAgentStream', () => {
  it('pipes with the UI protocol by default', () => {
    const ui = vi.fn();
    const text = vi.fn();
    pipeAgentStream(
      { pipeUIMessageStreamToResponse: ui, pipeTextStreamToResponse: text },
      {} as ServerResponse,
    );
    expect(ui).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
  });

  it('pipes with the text protocol when requested', () => {
    const ui = vi.fn();
    const text = vi.fn();
    pipeAgentStream(
      { pipeUIMessageStreamToResponse: ui, pipeTextStreamToResponse: text },
      {} as ServerResponse,
      { protocol: 'text' },
    );
    expect(text).toHaveBeenCalledOnce();
    expect(ui).not.toHaveBeenCalled();
  });

  it('throws when the result lacks the requested protocol method', () => {
    expect(() =>
      pipeAgentStream({}, {} as ServerResponse, { protocol: 'text' }),
    ).toThrowError(/does not support the "text" protocol/);
  });
});
