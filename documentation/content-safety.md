# Content safety

Two guardrails: **PII redaction** and **moderation**. Both integrate with the
guardrail pipeline — register them as providers or via `forFeature({ guardrails })`.

## PII redaction

Redacts emails, phone numbers, credit cards, and US SSNs from the messages sent
to the model.

```ts
import { PiiRedactionGuardrail } from '@mgvdev/nestjs-ai';

AiModule.forFeature({ guardrails: [PiiRedactionGuardrail] });
```

Custom patterns / replacement:

```ts
import { createPiiRedactionGuardrail } from '@mgvdev/nestjs-ai';

const MyRedaction = createPiiRedactionGuardrail({
  patterns: [/\bACC-\d{6}\b/g],
  replacement: '[HIDDEN]',
});
AiModule.forFeature({ guardrails: [MyRedaction] });
```

Standalone helpers are exported too: `redactPii(text, patterns?, replacement?)`
and `redactMessages(messages, …)`.

## Moderation

Blocks a run when the input contains a deny-listed term or fails a custom check.

```ts
import { createModerationGuardrail } from '@mgvdev/nestjs-ai';

const Moderation = createModerationGuardrail({
  blocked: ['secret-project', 'internal-only'],
  moderate: async (text) => (await callModerationApi(text)).flagged, // optional
});
AiModule.forFeature({ guardrails: [Moderation] });
```

A blocked run throws `ContentBlockedError`.

## Ordering

Guardrails run in registration order. Put PII redaction before moderation if you
want moderation to see the redacted text, or after if it should see the raw text.
