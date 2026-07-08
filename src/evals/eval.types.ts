/** A single evaluation case. */
export interface EvalCase {
  name?: string;
  input: string;
  /** Expected substring/answer (used by the default judge). */
  expected?: string;
  /** Rubric text passed to an LLM judge. */
  rubric?: string;
}

/** A judge's verdict for one output. */
export interface EvalScore {
  /** Normalized score in [0, 1]. */
  score: number;
  passed: boolean;
  reasoning?: string;
}

/** Full result for one case. */
export interface EvalResult extends EvalScore {
  name: string;
  input: string;
  output: string;
}

/** Aggregate report over all cases. */
export interface EvalReport {
  results: EvalResult[];
  averageScore: number;
  passRate: number;
}

/** Scores an agent output against its case. */
export type Judge = (ctx: {
  case: EvalCase;
  output: string;
}) => Promise<EvalScore> | EvalScore;
