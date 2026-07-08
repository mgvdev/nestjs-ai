import { describe, expect, it } from 'vitest';
import {
  EvalRunner,
  createLlmJudge,
  type JudgeAi,
  type RunnableAgent,
} from './eval-runner.service.js';

function agentReturning(map: Record<string, string>): RunnableAgent {
  return { run: async (input) => ({ text: map[input] ?? '' }) };
}

describe('EvalRunner', () => {
  it('scores with the default substring judge and aggregates', async () => {
    const agent = agentReturning({ 'capital of France?': 'It is Paris.' , '2+2?': 'five' });
    const runner = new EvalRunner();
    const report = await runner.run(agent, [
      { input: 'capital of France?', expected: 'Paris' },
      { input: '2+2?', expected: '4' },
    ]);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[1].passed).toBe(false);
    expect(report.averageScore).toBe(0.5);
    expect(report.passRate).toBe(0.5);
  });

  it('uses an LLM judge', async () => {
    const ai: JudgeAi = {
      generateObject: async () => ({
        object: { score: 4, reasoning: 'good' },
      }),
    };
    const runner = new EvalRunner();
    const report = await runner.run(
      agentReturning({ q: 'answer' }),
      [{ input: 'q', rubric: 'is it good?' }],
      { judge: createLlmJudge(ai, { scale: 5 }) },
    );
    expect(report.results[0].score).toBeCloseTo(0.8);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[0].reasoning).toBe('good');
  });
});
