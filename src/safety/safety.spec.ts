import { describe, expect, it } from 'vitest';
import type { GuardrailContext } from '../observability/guardrail.interface.js';
import type { AiMessage } from '../messages/message.types.js';
import {
  PiiRedactionGuardrail,
  createPiiRedactionGuardrail,
  redactPii,
} from './pii-redaction.guardrail.js';
import {
  ContentBlockedError,
  createModerationGuardrail,
} from './moderation.guardrail.js';

function ctx(messages: AiMessage[]): GuardrailContext {
  return { agent: 'A', agentInstance: {}, messages, options: {} };
}

describe('PII redaction', () => {
  it('redacts emails and SSNs', () => {
    expect(redactPii('reach me at a@b.com')).toBe('reach me at [REDACTED]');
    expect(redactPii('ssn 123-45-6789')).toBe('ssn [REDACTED]');
  });

  it('guardrail redacts message content in place', () => {
    const messages: AiMessage[] = [{ role: 'user', content: 'email x@y.com' }];
    new PiiRedactionGuardrail().beforeRun(ctx(messages));
    expect(messages[0].content).toBe('email [REDACTED]');
  });

  it('supports custom replacement', () => {
    const Guard = createPiiRedactionGuardrail({ replacement: '***' });
    const messages: AiMessage[] = [{ role: 'user', content: 'a@b.com' }];
    new Guard().beforeRun(ctx(messages));
    expect(messages[0].content).toBe('***');
  });
});

describe('Moderation', () => {
  it('blocks a deny-listed term', async () => {
    const Guard = createModerationGuardrail({ blocked: ['forbidden'] });
    await expect(
      new Guard().beforeRun!(
        ctx([{ role: 'user', content: 'this is Forbidden' }]),
      ),
    ).rejects.toThrow(ContentBlockedError);
  });

  it('allows clean content', async () => {
    const Guard = createModerationGuardrail({ blocked: ['forbidden'] });
    await expect(
      new Guard().beforeRun!(ctx([{ role: 'user', content: 'all good' }])),
    ).resolves.toBeUndefined();
  });

  it('runs a custom moderate hook', async () => {
    const Guard = createModerationGuardrail({
      moderate: (text) => text.includes('nope'),
    });
    await expect(
      new Guard().beforeRun!(ctx([{ role: 'user', content: 'nope' }])),
    ).rejects.toThrow(/custom moderation/);
  });
});
