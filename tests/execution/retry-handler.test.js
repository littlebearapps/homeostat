import { describe, expect, it, vi } from 'vitest';
import attemptFixWithRetries, {
  isSameError,
  levenshteinDistance
} from '../../homeostat/execution/retry-handler.js';

describe('levenshteinDistance', () => {
  it('calculates expected distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('isSameError', () => {
  it('detects highly similar errors', () => {
    const attemptA = { testOutput: 'Error: Timeout while fetching data' };
    const attemptB = { testOutput: 'Error: Timeout while fetching data   ' };
    expect(isSameError(attemptA, attemptB)).toBe(true);
  });

  it('differentiates distinct errors', () => {
    const attemptA = { message: 'Compilation error' };
    const attemptB = { message: 'Network failure' };
    expect(isSameError(attemptA, attemptB)).toBe(false);
  });
});

describe('attemptFixWithRetries', () => {
  it('returns success on first attempt without retries', async () => {
    const executor = vi.fn().mockResolvedValue({ testsPassed: true, output: 'ok' });
    const result = await attemptFixWithRetries({ tier: 1, executeAttempt: executor }, {}, 2);
    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('retries flaky failure and succeeds on second attempt', async () => {
    const executor = vi
      .fn()
      .mockResolvedValueOnce({ testOutput: 'Error: Snapshot mismatch' })
      .mockResolvedValueOnce({ testsPassed: true });
    const result = await attemptFixWithRetries({ tier: 1, executeAttempt: executor }, {}, 2);
    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('detects deterministic failures and escalates early', async () => {
    const executor = vi
      .fn()
      .mockResolvedValue({ testOutput: 'Error: Cannot read property foo of undefined' });
    const result = await attemptFixWithRetries({ tier: 2, executeAttempt: executor }, {}, 2);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('deterministic_failure');
    expect(result.attempts).toHaveLength(2);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('escalates after exhausting attempts with differing errors', async () => {
    const executor = vi
      .fn()
      .mockResolvedValueOnce({ testOutput: 'Error: Timeout 1' })
      .mockResolvedValueOnce({ testOutput: 'Error: Timeout 2' });
    const result = await attemptFixWithRetries({ tier: 1, executeAttempt: executor }, {}, 2);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('max_retries_exceeded');
    expect(result.attempts).toHaveLength(2);
  });

  it('limits tier 3 to a single attempt', async () => {
    const executor = vi.fn().mockResolvedValue({ testOutput: 'Error: Fatal regression' });
    const result = await attemptFixWithRetries({ tier: 3, executeAttempt: executor }, {}, 5);
    expect(result.attempts).toHaveLength(1);
    expect(result.reason).toBe('max_retries_exceeded');
  });

  it('supports executors using (tier, error, context) signature', async () => {
    const executor = vi.fn(async (tier, error, context) => ({
      testsPassed: context.attemptNumber === 2,
      testOutput: `Error: attempt ${context.attemptNumber}`
    }));
    const result = await attemptFixWithRetries({ tier: 1, attemptFix: executor }, {}, 2);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });
});
