/**
 * Retry handler per FOLLOW-UP-QUESTIONS-ANSWERED.md lines 75-126.
 */

function resolveExecutor(tier, executorOverride) {
  if (executorOverride) return executorOverride;
  if (typeof tier?.executeAttempt === 'function') return tier.executeAttempt;
  if (typeof tier?.attemptFix === 'function') return tier.attemptFix;
  if (typeof tier?.executor === 'function') return tier.executor;
  if (typeof tier?.run === 'function') return tier.run;
  return null;
}

export function levenshteinDistance(a = '', b = '') {
  const strA = String(a);
  const strB = String(b);
  const lenA = strA.length;
  const lenB = strB.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const matrix = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));

  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[lenA][lenB];
}

function extractErrorMessage(attempt) {
  if (!attempt) return '';
  if (typeof attempt === 'string') return attempt;
  if (attempt.testOutput) {
    const matched = attempt.testOutput.match(/Error: (.*)/i);
    if (matched) return matched[1];
  }
  if (attempt.error) {
    if (typeof attempt.error === 'string') return attempt.error;
    if (attempt.error.message) return attempt.error.message;
  }
  if (attempt.message) return attempt.message;
  return '';
}

export function isSameError(previousAttempt, currentAttempt) {
  const prevMessage = extractErrorMessage(previousAttempt);
  const currMessage = extractErrorMessage(currentAttempt);
  if (!prevMessage || !currMessage) return false;
  const distance = levenshteinDistance(prevMessage, currMessage);
  const maxLength = Math.max(prevMessage.length, currMessage.length) || 1;
  return distance / maxLength <= 0.1;
}

function defaultAttemptLimit(tier) {
  const tierNumber = typeof tier === 'number' ? tier : tier?.tier;
  if (tierNumber === 3) return 1;
  return 2;
}

export async function attemptFixWithRetries(tier, error, maxAttempts, executorOverride) {
  const attempts = [];
  const executor = resolveExecutor(tier, executorOverride);
  if (typeof executor !== 'function') {
    throw new Error('No executor available for retry handler');
  }

  const limit = Math.max(1, Math.min(maxAttempts ?? defaultAttemptLimit(tier), defaultAttemptLimit(tier)));

  for (let attemptIndex = 0; attemptIndex < limit; attemptIndex++) {
    const context = {
      tier,
      error,
      attemptNumber: attemptIndex + 1,
      previousAttempts: [...attempts]
    };

    const result = executor.length >= 3
      ? await executor(tier, error, context)
      : await executor(context);

    attempts.push(result);

    const testsPassed = result?.testsPassed === true || result?.success === true;
    if (testsPassed) {
      return { success: true, result, attempts };
    }

    if (attemptIndex > 0 && isSameError(attempts[attemptIndex - 1], result)) {
      return {
        success: false,
        shouldEscalate: true,
        reason: 'deterministic_failure',
        attempts
      };
    }
  }

  return {
    success: false,
    shouldEscalate: true,
    reason: 'max_retries_exceeded',
    attempts
  };
}

export default attemptFixWithRetries;
