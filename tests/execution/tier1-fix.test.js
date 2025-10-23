import { describe, expect, it, vi } from 'vitest';

vi.mock('../../homeostat/routing/complexity-analyzer.js', () => ({
  parseIssue: vi.fn(async () => ({
    extension: 'NoteBridge',
    stackTrace: 'Error\n    at /Users/tester/project/shared/api-keys.js:10:5',
    breadcrumbs: ['step one'],
    issueNumber: 1
  }))
}));

const { executeTier1 } = await import('../../homeostat/execution/tier1-fix.js');

describe('tier1 execution', () => {
  it('falls back to GPT-5 when DeepSeek fails', async () => {
    const runTestsFn = vi.fn().mockResolvedValue({ passed: true, output: 'ok' });
    const callOpenAI = vi.fn().mockResolvedValue('patch content');
    const result = await executeTier1(1, {
      callDeepSeekFn: vi.fn().mockRejectedValue(new Error('DeepSeek down')),
      callOpenAIFn: callOpenAI,
      runTestsFn
    });
    expect(callOpenAI).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('sanitizes stack trace before model call', async () => {
    const seenIssue = [];
    const runTestsFn = vi.fn().mockResolvedValue({ passed: true, output: 'ok' });
    await executeTier1(1, {
      callDeepSeekFn: vi.fn(async (issue) => {
        seenIssue.push(issue.stackTrace);
        throw new Error('force fallback');
      }),
      callOpenAIFn: vi.fn().mockResolvedValue('patch content'),
      runTestsFn
    }).catch(() => {});
    expect(seenIssue[0]).not.toContain('/Users/tester');
    expect(seenIssue[0]).toContain('[REDACTED_USER_PATH]/project/shared/api-keys.js:10:5');
  });

  it('rejects suspicious patches', async () => {
    const runTestsFn = vi.fn().mockResolvedValue({ passed: true, output: 'ok' });
    await expect(
      executeTier1(1, {
        callDeepSeekFn: vi.fn().mockResolvedValue('eval("alert(1)")'),
        callOpenAIFn: vi.fn(),
        runTestsFn
      })
    ).rejects.toThrow(/Security violation/);
  });

  it('halts when fix loop detected', async () => {
    await expect(
      executeTier1(1, { history: ['Error\n    at [REDACTED_USER_PATH]/project/shared/api-keys.js:10:5'] })
    ).rejects.toThrow(/fix loop/);
  });
});
