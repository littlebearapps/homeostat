import { describe, expect, it, vi } from 'vitest';

vi.mock('../../homeostat/routing/complexity-analyzer.js', () => ({
  parseIssue: vi.fn(async () => ({
    extension: 'PaletteKit',
    stackTrace: 'Error\n    at background/auth.js:12:3',
    breadcrumbs: ['step'],
    issueNumber: 2
  }))
}));

const { executeTier2 } = await import('../../homeostat/execution/tier2-fix.js');

describe('tier2 execution', () => {
  it('approves DeepSeek patch with GPT-5 review', async () => {
    const runTestsFn = vi.fn().mockResolvedValue({ passed: true, output: 'ok' });
    const result = await executeTier2(2, {
      callDeepSeekFn: vi.fn().mockResolvedValue('valid patch'),
      callOpenAIReviewFn: vi.fn().mockResolvedValue('APPROVED'),
      runTestsFn
    });
    expect(result.success).toBe(true);
  });

  it('falls back to GPT-5 patch when DeepSeek fails', async () => {
    const runTestsFn = vi.fn().mockResolvedValue({ passed: true, output: 'ok' });
    const callOpenAIPatchFn = vi.fn().mockResolvedValue('gpt patch');
    await executeTier2(2, {
      callDeepSeekFn: vi.fn().mockRejectedValue(new Error('offline')),
      callOpenAIReviewFn: vi.fn().mockResolvedValue('APPROVED'),
      callOpenAIPatchFn,
      runTestsFn
    });
    expect(callOpenAIPatchFn).toHaveBeenCalled();
  });

  it('rejects when reviewer does not approve', async () => {
    await expect(
      executeTier2(2, {
        callDeepSeekFn: vi.fn().mockResolvedValue('patch'),
        callOpenAIReviewFn: vi.fn().mockResolvedValue('REJECTED')
      })
    ).rejects.toThrow(/rejected/);
  });
});
