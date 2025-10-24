import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processIssue } from '../../homeostat/orchestrator.js';
import { parseLoggerIssue } from '../../homeostat/routing/issue-parser.js';
import { FailureFingerprinter } from '../../shared/patterns/fingerprinter.js';
import { metrics } from '../../shared/observability/metrics.js';
import { MockGitHubAPI } from '../mocks/github-api';

function libraryPath() {
  return process.env.HOMEOSTAT_PATTERN_LIBRARY_PATH ?? path.join('shared', 'patterns', 'library.json');
}

function buildIssue(number: number, fingerprint: string) {
  return {
    number,
    title: `[Convert My File] TypeError: Failure #${number}`,
    body: `## Error Details\n- Extension: Convert My File v1.0.0\n- Error Type: TypeError\n- Message: Failure\n- Timestamp: 2025-10-24T10:00:00Z\n- Fingerprint: ${fingerprint}\n\n## Stack Trace\n\`\`\`\nError: Failure\n    at main (src/background.ts:10:5)\n\`\`\`\n\n## Breadcrumbs\n1. Step one\n2. Step two\n3. Step three`,
    labels: [{ name: 'robot' }],
    state: 'open' as const
  };
}

function resetLibrary(targetPath: string) {
  fs.writeFileSync(
    targetPath,
    JSON.stringify(
      {
        version: 1,
        patterns: [],
        metadata: {
          lastUpdated: '2025-10-24T00:00:00Z',
          totalPatterns: 0,
          note:
            'Pattern library starts empty. In PRODUCTION mode, patterns are extracted from successful PRs and learned from results.'
        }
      },
      null,
      2
    ) + '\n'
  );
}

describe.sequential('e2e: self-healing feature flags', () => {
  const originalEnv = process.env.HOMEOSTAT_ENV;
  let tempDir: string;
  let patternLibraryPath: string;
  let attemptPath: string;

  beforeEach(() => {
    metrics.reset();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-healing-'));
    patternLibraryPath = path.join(tempDir, 'library.json');
    attemptPath = path.join(tempDir, 'attempt-store.json');
    process.env.HOMEOSTAT_PATTERN_LIBRARY_PATH = patternLibraryPath;
    process.env.HOMEOSTAT_ATTEMPT_STORE_PATH = attemptPath;
    resetLibrary(patternLibraryPath);
    fs.writeFileSync(attemptPath, '[]\n');
    try {
      fs.rmSync('artifacts', { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.HOMEOSTAT_ENV;
    } else {
      process.env.HOMEOSTAT_ENV = originalEnv;
    }
    try {
      fs.rmSync('artifacts', { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    delete process.env.HOMEOSTAT_PATTERN_LIBRARY_PATH;
    delete process.env.HOMEOSTAT_ATTEMPT_STORE_PATH;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps pattern extraction disabled in dev mode', async () => {
    process.env.HOMEOSTAT_ENV = 'dev';
    const github = new MockGitHubAPI();
    const issue = buildIssue(1, 'fp-dev');
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });
    expect(result.success).toBe(true);

    const library = JSON.parse(fs.readFileSync(libraryPath(), 'utf8'));
    expect(library.patterns).toHaveLength(0);
  });

  it('keeps pattern extraction disabled in test mode', async () => {
    process.env.HOMEOSTAT_ENV = 'test';
    const github = new MockGitHubAPI();
    const issue = buildIssue(2, 'fp-test');
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });
    expect(result.success).toBe(true);

    const library = JSON.parse(fs.readFileSync(libraryPath(), 'utf8'));
    expect(library.patterns).toHaveLength(0);
  });

  it('extracts patterns in production mode', async () => {
    process.env.HOMEOSTAT_ENV = 'production';
    const github = new MockGitHubAPI();
    const issue = buildIssue(3, 'fp-prod');
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });
    expect(result.success).toBe(true);

    const library = JSON.parse(fs.readFileSync(libraryPath(), 'utf8'));
    expect(library.patterns).toHaveLength(1);
    expect(library.patterns[0].fingerprintId).toBeDefined();
  });

  it('applies zero-cost fixes when pattern exists', async () => {
    process.env.HOMEOSTAT_ENV = 'production';
    const pattern = {
      id: 'pattern-1',
      fingerprintId: 'fp-pattern',
      errorType: 'TypeError',
      filePath: 'src/background.ts',
      patch: `diff --git a/src/background.ts b/src/background.ts\n+console.log('pattern');`,
      description: 'Pattern replay',
      confidence: 0.95,
      successRate: 1,
      uses: 0
    };
    fs.writeFileSync(
      libraryPath(),
      JSON.stringify({ version: 1, patterns: [pattern] }, null, 2) + '\n'
    );

    const github = new MockGitHubAPI();
    const issue = buildIssue(4, 'fp-pattern');
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: false });
    expect(result.success).toBe(true);
    expect(result.tier).toBe(0);
    expect(result.model).toContain('pattern');
  });

  it('falls back to AI and learns new patterns in production', async () => {
    process.env.HOMEOSTAT_ENV = 'production';
    const github = new MockGitHubAPI();
    const issue = buildIssue(5, 'fp-ai');
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });
    expect(result.success).toBe(true);

    const library = JSON.parse(fs.readFileSync(libraryPath(), 'utf8'));
    expect(library.patterns.length).toBeGreaterThanOrEqual(1);
    const { parsed } = parseLoggerIssue(issue);
    const expectedFingerprint = FailureFingerprinter.normalize({
      type: parsed.errorType || 'UnknownError',
      message: parsed.errorMessage || parsed.message || '',
      stack: parsed.stackTrace || ''
    });
    const fingerprintIds = library.patterns.map((pattern) => pattern.fingerprintId);
    expect(fingerprintIds).toContain(expectedFingerprint.id);
  });
});
