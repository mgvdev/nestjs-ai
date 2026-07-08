/**
 * A named, optionally versioned prompt template.
 */
export interface PromptDefinition {
  /** Unique name used to look the prompt up. */
  name: string;
  /** Optional version; when omitted the latest registered version is used. */
  version?: string;
  /** Template body with `{{variable}}` placeholders. */
  template: string;
  /** Optional human-readable description. */
  description?: string;
}

/** Reference to a registered prompt for rendering. */
export interface PromptRef {
  name: string;
  vars?: Record<string, unknown>;
  version?: string;
}

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Replaces `{{var}}` placeholders in `template` with values from `vars`.
 * Throws if a referenced variable is missing, to catch typos early.
 */
export function interpolate(
  template: string,
  vars: Record<string, unknown> = {},
): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Missing variable "${key}" for prompt interpolation.`);
    }
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}
