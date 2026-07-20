/** Price per 1M tokens, in USD. */
export interface ModelPricing {
  input: number;
  output: number;
}

/** Maps a bare model id (no provider prefix) to its pricing. */
export type PricingTable = Record<string, ModelPricing>;

/** Minimal usage shape needed for cost. */
export interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Default USD pricing per 1M tokens for common models. Override or extend via
 * `AiModule.forRoot({ pricing })`. Prices are indicative — verify against your
 * provider's current rates.
 */
export const DEFAULT_PRICING: PricingTable = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-opus-4': { input: 15, output: 75 },
  'claude-haiku-4': { input: 0.8, output: 4 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
};

/** Strips a `"provider:"` prefix from a model id. */
export function bareModelId(modelId: string): string {
  const sep = modelId.indexOf(':');
  return sep === -1 ? modelId : modelId.slice(sep + 1);
}

/**
 * Computes the USD cost of a usage record for a model. Returns 0 when the model
 * is not in the pricing table.
 */
export function costOf(
  usage: UsageLike,
  modelId: string,
  pricing: PricingTable = DEFAULT_PRICING,
): number {
  const price = pricing[bareModelId(modelId)] ?? pricing[modelId];
  if (!price) {
    return 0;
  }
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return (
    (input / 1_000_000) * price.input + (output / 1_000_000) * price.output
  );
}
