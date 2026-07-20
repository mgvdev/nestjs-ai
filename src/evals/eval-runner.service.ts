import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { EvalCase, EvalReport, EvalResult, Judge } from './eval.types.js';

/** Minimal agent shape the runner needs. */
export interface RunnableAgent {
  run(input: string): Promise<{ text: string }>;
}

/** Minimal `AiService` shape for the LLM judge. */
export interface JudgeAi {
  generateObject(params: {
    model?: string;
    schema: unknown;
    prompt: string;
  }): Promise<{ object: { score: number; reasoning: string } }>;
}

export interface RunEvalOptions {
  judge?: Judge;
  /** Pass threshold in [0, 1] for the default judge (default 1). */
  passThreshold?: number;
}

/**
 * Runs an agent over a set of cases and scores each output with a judge
 * (default: substring match against `expected`; or an LLM judge).
 */
@Injectable()
export class EvalRunner {
  async run(
    agent: RunnableAgent,
    cases: EvalCase[],
    options: RunEvalOptions = {},
  ): Promise<EvalReport> {
    const judge = options.judge ?? defaultJudge(options.passThreshold ?? 1);
    const results: EvalResult[] = [];

    for (const evalCase of cases) {
      const { text } = await agent.run(evalCase.input);
      const score = await judge({ case: evalCase, output: text });
      results.push({
        name: evalCase.name ?? evalCase.input,
        input: evalCase.input,
        output: text,
        ...score,
      });
    }

    const averageScore = results.length
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;
    const passRate = results.length
      ? results.filter((r) => r.passed).length / results.length
      : 0;

    return { results, averageScore, passRate };
  }
}

/** Substring-match judge against `case.expected`. */
export function defaultJudge(threshold: number): Judge {
  return ({ case: evalCase, output }) => {
    if (evalCase.expected == null) {
      return {
        score: 0,
        passed: false,
        reasoning: 'no expected value or judge',
      };
    }
    const score = output.includes(evalCase.expected) ? 1 : 0;
    return { score, passed: score >= threshold };
  };
}

/**
 * Builds an LLM-as-judge that scores outputs 0..`scale` and normalizes to [0,1].
 */
export function createLlmJudge(
  ai: JudgeAi,
  options: { model?: string; scale?: number; passThreshold?: number } = {},
): Judge {
  const scale = options.scale ?? 5;
  const passThreshold = options.passThreshold ?? 0.6;
  return async ({ case: evalCase, output }) => {
    const { object } = await ai.generateObject({
      model: options.model,
      schema: z.object({ score: z.number(), reasoning: z.string() }),
      prompt:
        `Rubric: ${evalCase.rubric ?? 'Is the answer correct and helpful?'}\n` +
        `Expected: ${evalCase.expected ?? 'n/a'}\n` +
        `Output: ${output}\n` +
        `Give a score from 0 to ${scale} and a brief reasoning.`,
    });
    const normalized = Math.max(0, Math.min(1, object.score / scale));
    return {
      score: normalized,
      passed: normalized >= passThreshold,
      reasoning: object.reasoning,
    };
  };
}
