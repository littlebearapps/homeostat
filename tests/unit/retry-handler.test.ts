import { beforeEach, describe, expect, it, vi } from 'vitest';
import attemptFixWithRetries, {
  isSameError,
  levenshteinDistance
} from '../../homeostat/execution/retry-handler.js';

function createExecutor(results) {
  let index = 0;
  return vi.fn(async () => {
    const result = results[Math.min(index, results.length - 1)];
    index += 1;
    return result;
  });
}

describe('retry-handler: levenshtein', () => {
  it('computes zero distance for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('computes distance for insertions', () => {
    expect(levenshteinDistance('abc', 'abcd')).toBe(1);
  });

  it('computes distance for substitutions', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('retry-handler: isSameError', () => {
  it('detects identical messages as same error', () => {
    expect(
      isSameError({ error: 'TypeError: undefined' }, { error: 'TypeError: undefined' })
    ).toBe(true);
  });

  it('detects similar messages within threshold', () => {
    expect(
      isSameError(
        { error: 'ReferenceError: foo is not defined' },
        { error: 'ReferenceError: foo was not defined' }
      )
    ).toBe(true);
  });

  it('treats different messages as different errors', () => {
    expect(isSameError({ error: 'TypeError' }, { error: 'ReferenceError' })).toBe(false);
  });

  it('handles missing messages gracefully', () => {
    expect(isSameError({}, {})).toBe(false);
  });
});

describe('retry-handler: attemptFixWithRetries', () => {
  let tier;

  beforeEach(() => {
    tier = { tier: 1 };
  });

  it('succeeds on first attempt without retry', async () => {
    const executor = createExecutor([{ success: true, testsPassed: true }]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.success).toBe(true);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('retries once on failure then succeeds', async () => {
    const executor = createExecutor([
      { success: false, testOutput: 'TypeError: x is undefined' },
      { success: true, testsPassed: true }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });

  it('escalates deterministic failure on identical errors', async () => {
    const executor = createExecutor([
      { success: false, error: 'TypeError: x is undefined' },
      { success: false, error: 'TypeError: x is undefined' }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.success).toBe(false);
    expect(result.shouldEscalate).toBe(true);
    expect(result.reason).toBe('deterministic_failure');
  });

  it('escalates after reaching max retries', async () => {
    const executor = createExecutor([
      { success: false, error: 'TypeError: cannot read property' },
      { success: false, error: 'RangeError: invalid length' }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.reason).toBe('max_retries_exceeded');
  });

  it('caps attempts based on tier default', async () => {
    const executor = createExecutor([
      { success: false, error: 'TypeError 1' },
      { success: false, error: 'TypeError 2' },
      { success: true }
    ]);
    const result = await attemptFixWithRetries({ tier: 3 }, {}, 5, executor);
    expect(result.attempts).toHaveLength(1);
  });

  it('passes context with attempt metadata', async () => {
    const executor = vi.fn(async (context) => ({ success: false, ...context }));
    await attemptFixWithRetries(tier, { id: 1 }, 2, executor);
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 1, previousAttempts: [] })
    );
  });

  it('supports executor signatures expecting tier and error', async () => {
    const executor = vi.fn(async (_tier, _error, context) => ({ success: false, ...context }));
    await attemptFixWithRetries(tier, { id: 2 }, 1, executor);
    expect(executor).toHaveBeenCalledWith(tier, { id: 2 }, expect.any(Object));
  });

  it('throws when executor is missing', async () => {
    await expect(attemptFixWithRetries({}, {}, 1)).rejects.toThrow('No executor available');
  });

  it('handles test output similarity detection', async () => {
    const executor = createExecutor([
      { success: false, testOutput: 'Error: Timeout at step 1' },
      { success: false, testOutput: 'Error: Timeout at step 1' }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.reason).toBe('deterministic_failure');
  });

  it('treats differing outputs as flaky and retries fully', async () => {
    const executor = createExecutor([
      { success: false, testOutput: 'Error: Timeout at step 1' },
      { success: false, testOutput: 'Warning: Database locked unexpectedly' }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.reason).toBe('max_retries_exceeded');
  });

  it('supports custom tier objects with executeAttempt method', async () => {
    const tierExecutor = {
      tier: 1,
      executeAttempt: vi.fn(async () => ({ success: true, testsPassed: true }))
    };
    const result = await attemptFixWithRetries(tierExecutor, {}, 2);
    expect(result.success).toBe(true);
  });

  it('handles error messages nested in objects', async () => {
    const executor = createExecutor([
      { success: false, error: { message: 'Failure occurred' } },
      { success: false, error: { message: 'Failure occurred' } }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.reason).toBe('deterministic_failure');
  });

  it('handles messages from testOutput fallback', async () => {
    const executor = createExecutor([
      { success: false, testOutput: 'Error: Database locked' },
      { success: false, error: { message: 'Database locked' } }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.reason).toBe('deterministic_failure');
  });

  it('treats maxAttempts less than 1 as 1', async () => {
    const executor = createExecutor([{ success: false, error: 'Fail' }]);
    const result = await attemptFixWithRetries(tier, {}, 0, executor);
    expect(result.attempts).toHaveLength(1);
  });

  it('propagates previous attempts into context', async () => {
    const executor = vi.fn(async (context) => {
      if (context.attemptNumber === 1) {
        return { success: false, error: 'fail1' };
      }
      expect(context.previousAttempts).toHaveLength(1);
      return { success: false, error: 'fail2' };
    });
    await attemptFixWithRetries(tier, {}, 2, executor);
  });

  it('distinguishes errors with small differences beyond threshold', async () => {
    const executor = createExecutor([
      { success: false, error: 'Error: step 1 failed' },
      { success: false, error: 'Unhandled rejection: API unreachable' }
    ]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.reason).toBe('max_retries_exceeded');
  });

  it('allows success results flagged with testsPassed boolean', async () => {
    const executor = createExecutor([{ testsPassed: true }]);
    const result = await attemptFixWithRetries(tier, {}, 2, executor);
    expect(result.success).toBe(true);
  });
});
