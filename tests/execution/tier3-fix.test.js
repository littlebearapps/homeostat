import { describe, expect, it, vi } from 'vitest';

vi.mock('../../homeostat/routing/complexity-analyzer.js', () => ({
  parseIssue: vi.fn(async () => ({
    extension: 'ConvertMyFile',
    stackTrace: 'Error\n    at content/script.js:5:2',
    breadcrumbs: ['step'],
    issueNumber: 3
  }))
}));

const { executeTier3 } = await import('../../homeostat/execution/tier3-fix.js');

describe('tier3 execution', () => {
  it('uses GPT-5 patch and runs tests', async () => {
    const runTestsFn = vi.fn().mockResolvedValue({ passed: true, output: 'ok' });
    const callOpenAIFn = vi.fn().mockResolvedValue('patch');
    const result = await executeTier3(3, { callOpenAIFn, runTestsFn });
    expect(callOpenAIFn).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
