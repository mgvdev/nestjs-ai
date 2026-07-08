import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { EMPTY, type Observable, mergeMap } from 'rxjs';
import {
  pipeAgentStream,
  type PipeableStreamResult,
  type PipeAgentStreamOptions,
} from './stream-response.js';

/**
 * Interceptor that pipes a stream result returned by a route handler to the
 * HTTP response. The handler returns the `streamText`/agent `.stream()` result;
 * the interceptor pipes it and completes the request.
 *
 * @example
 * ```ts
 * @UseInterceptors(new AgentStreamInterceptor({ protocol: 'ui' }))
 * @Post('chat')
 * chat(@Body('prompt') prompt: string) {
 *   return this.agent.stream(prompt);
 * }
 * ```
 */
@Injectable()
export class AgentStreamInterceptor implements NestInterceptor {
  constructor(private readonly options: PipeAgentStreamOptions = {}) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<never> {
    const res = context.switchToHttp().getResponse<import('node:http').ServerResponse>();
    return next.handle().pipe(
      mergeMap((result: PipeableStreamResult) => {
        pipeAgentStream(result, res, this.options);
        return EMPTY;
      }),
    );
  }
}
