/** Context passed to an approval gate for a tool call awaiting approval. */
export interface ApprovalContext {
  tool: string;
  args: unknown;
  /** Name of the agent making the call, when available. */
  agent?: string;
}

/**
 * Decides whether a tool flagged `requiresApproval` may execute. Implement this
 * to plug in human-in-the-loop approval (e.g. block on a queue, check a policy)
 * and register it via `AiModule.forRoot({ approvalGate })`.
 */
export interface ApprovalGate {
  /** Resolve `true` to allow the tool call, `false` to block it. */
  requestApproval(context: ApprovalContext): Promise<boolean>;
}

/** Thrown when an approval gate denies a tool call. */
export class ToolApprovalDeniedError extends Error {
  constructor(public readonly tool: string) {
    super(`Tool "${tool}" was denied by the approval gate.`);
    this.name = 'ToolApprovalDeniedError';
  }
}
