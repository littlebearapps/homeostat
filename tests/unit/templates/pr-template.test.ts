import { describe, expect, it } from 'vitest';
import type { AttemptState } from '../../../shared/patterns/attempt-store.js';
import type { ErrorFingerprint } from '../../../shared/patterns/fingerprinter.js';
import { generatePRBody } from '../../../homeostat/templates/pr-template.js';

const fingerprint: ErrorFingerprint = {
  id: 'fp-123',
  errorType: 'TypeError',
  filePath: 'src/index.ts',
  topStackFrame: 'Error: boom',
  messageHash: 'abc12345',
  fullSignature: 'TypeError:src/index.ts:abc12345'
};

const attemptState: AttemptState = {
  fingerprint: 'fp-123',
  attempts: 1,
  cooldownUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  lastAttempt: new Date().toISOString(),
  history: []
};

describe('generatePRBody', () => {
  it('renders key sections with safety checks and state', () => {
    const body = generatePRBody({
      fingerprint,
      error: {
        type: 'TypeError',
        message: 'Unexpected token',
        filePath: 'src/index.ts',
        stack: 'Error: boom\n    at main (src/index.ts:1:1)'
      },
      attemptState,
      patchSummary: '- src/index.ts',
      sanitizedStack: 'Error: boom',
      breadcrumbs: ['Open extension', 'Click button'],
      testResults: { passed: 1, total: 1 },
      tierUsed: 2,
      nextBackoff: new Date(attemptState.cooldownUntil ?? Date.now()),
      fixCost: 0.15,
      tokenUsage: { input: 200, output: 100, cacheRead: 0, cacheWrite: 0 },
      fixSource: 'ai',
      diffLines: 4,
      fileCount: 1,
      maxDiffLines: 500,
      maxFiles: 10
    });

    expect(body).toContain('## 🤖 Homeostat Auto-Fix');
    expect(body).toContain('**Fingerprint**: `fp-123`');
    expect(body).toContain('### Safety Checks');
    expect(body).toContain('Add label `do-not-fix`');
    expect(body).toContain('Diff size: 4 lines (limit: 500)');
  });

  it('includes pattern metadata when provided', () => {
    const body = generatePRBody({
      fingerprint,
      error: {
        type: 'TypeError',
        message: 'Unexpected token',
        filePath: 'src/index.ts',
        stack: 'Error: boom'
      },
      attemptState,
      patchSummary: '- src/index.ts',
      sanitizedStack: 'Error: boom',
      breadcrumbs: [],
      testResults: { passed: 1, total: 1 },
      tierUsed: 0,
      nextBackoff: new Date(),
      fixCost: 0,
      tokenUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      fixSource: 'pattern',
      diffLines: 1,
      fileCount: 1,
      maxDiffLines: 500,
      maxFiles: 10,
      patternId: 'pattern-42',
      confidence: 0.92,
      patternStrategy: 'exact'
    });

    expect(body).toContain('Pattern: pattern-42');
    expect(body).toContain('Confidence: 92%');
    expect(body).toContain('Strategy: exact');
  });
});
