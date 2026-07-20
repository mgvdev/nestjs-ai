import type { ServerResponse } from 'node:http';

/** Structural type for the pipe methods on a Vercel AI SDK stream result. */
export interface PipeableStreamResult {
  pipeUIMessageStreamToResponse?: (res: ServerResponse) => void;
  pipeTextStreamToResponse?: (res: ServerResponse) => void;
}

export interface PipeAgentStreamOptions {
  /**
   * Wire protocol: `'ui'` (AI SDK UI message stream, for `useChat`) or `'text'`
   * (plain text stream). Defaults to `'ui'`.
   */
  protocol?: 'ui' | 'text';
}

/**
 * Pipes an agent/`AiService` stream result to an HTTP response (Express-style
 * `ServerResponse`). Use in a controller that injected `@Res()`.
 *
 * @example
 * ```ts
 * @Post('chat')
 * async chat(@Body('prompt') prompt: string, @Res() res: Response) {
 *   pipeAgentStream(await this.agent.stream(prompt), res, { protocol: 'ui' });
 * }
 * ```
 */
export function pipeAgentStream(
  result: PipeableStreamResult,
  res: ServerResponse,
  options: PipeAgentStreamOptions = {},
): void {
  const protocol = options.protocol ?? 'ui';
  if (protocol === 'text') {
    if (typeof result.pipeTextStreamToResponse === 'function') {
      result.pipeTextStreamToResponse(res);
      return;
    }
  } else if (typeof result.pipeUIMessageStreamToResponse === 'function') {
    result.pipeUIMessageStreamToResponse(res);
    return;
  }
  throw new Error(
    `The stream result does not support the "${protocol}" protocol.`,
  );
}
