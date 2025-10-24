import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { processIssue, type RunContext } from '../../homeostat/orchestrator.js';
import { MockGitHubAPI } from '../mocks/github-api';
import { metrics } from '../../shared/observability/metrics.js';

const ATTEMPT_STORE_PATH = path.join('.homeostat', 'attempt-store.json');

function buildIssue(number: number, fingerprint: string) {
  return {
    number,
    title: `[Palette Kit] TypeError: Guardrail #${number}`,
    body: `## Error Details\n- Extension: Palette Kit v1.0.0\n- Error Type: TypeError\n- Message: Guardrail test\n- Timestamp: 2025-10-24T10:00:00Z\n- Fingerprint: ${fingerprint}\n\n## Stack Trace\n\`\`\`\nError: Guardrail\n    at main (src/app.ts:10:5)\n\`\`\`\n\n## Breadcrumbs\n1. Step one\n2. Step two\n3. Step three`,
    labels: [{ name: 'robot' }],
    state: 'open' as const
  };
}

function baseRunContext(): RunContext {
  return { totalCost: 0, patternsUsed: 0, zeroCostFixes: 0, cooldowns: 0, fingerprints: [] };
}

describe('e2e: safety guardrails', () => {
  beforeEach(() => {
    metrics.reset();
    fs.writeFileSync(ATTEMPT_STORE_PATH, '[]\n');
    fs.rmSync('artifacts', { recursive: true, force: true });
  });

  it('rejects patches exceeding diff line cap', async () => {
    const github = new MockGitHubAPI();
    const issue = buildIssue(30, 'fp-diff');
    github.addIssue(issue);

    const result = await processIssue(issue.number, {
      githubAPI: github,
      executeTier: async () => ({
        success: true,
        model: 'mock-model',
        patch: `diff --git a/src/app.ts b/src/app.ts\n+console.log('1');\n+console.log('2');\n+console.log('3');`,
        tokens: [
          { model: 'deepseek', inputTokens: 200, outputTokens: 80, issueNumber: issue.number, tier: 1 }
        ],
        cost: 0.01
      }),
      runContext: baseRunContext(),
      safety: { maxDiffLines: 2, maxFiles: 10, budgetLimit: 5 }
    });

    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('diff_limit_exceeded');
  });

  it('rejects patches exceeding file count cap', async () => {
    const github = new MockGitHubAPI();
    const issue = buildIssue(31, 'fp-files');
    github.addIssue(issue);

    const files = Array.from({ length: 3 }).map(
      (_, index) => `diff --git a/src/file${index}.ts b/src/file${index}.ts\n+console.log('${index}');`
    );

    const result = await processIssue(issue.number, {
      githubAPI: github,
      executeTier: async () => ({
        success: true,
        model: 'mock-model',
        patch: files.join('\n'),
        tokens: [
          { model: 'deepseek', inputTokens: 180, outputTokens: 60, issueNumber: issue.number, tier: 1 }
        ],
        cost: 0.01
      }),
      runContext: baseRunContext(),
      safety: { maxDiffLines: 50, maxFiles: 1, budgetLimit: 5 }
    });

    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('file_limit_exceeded');
  });

  it('stops processing when run budget is exceeded', async () => {
    const github = new MockGitHubAPI();
    const first = buildIssue(32, 'fp-budget-1');
    const second = buildIssue(33, 'fp-budget-2');
    github.addIssue(first);
    github.addIssue(second);

    const runContext = baseRunContext();

    const executeTier = async () => ({
      success: true,
      model: 'mock-model',
      patch: `diff --git a/src/app.ts b/src/app.ts\n+console.log('budget');`,
      tokens: [
        { model: 'deepseek', inputTokens: 400, outputTokens: 120, issueNumber: 0, tier: 1 }
      ],
      cost: 0.6
    });

    const firstResult = await processIssue(first.number, {
      githubAPI: github,
      executeTier,
      runContext,
      safety: { budgetLimit: 1, maxDiffLines: 500, maxFiles: 10 }
    });

    expect(firstResult.success).toBe(true);

    const secondResult = await processIssue(second.number, {
      githubAPI: github,
      executeTier,
      runContext,
      safety: { budgetLimit: 1, maxDiffLines: 500, maxFiles: 10 }
    });

    expect(secondResult.rejected).toBe(true);
    expect(secondResult.reason).toBe('budget_exceeded');
  });

  it('flags potential secrets in patches', async () => {
    const github = new MockGitHubAPI();
    const issue = buildIssue(34, 'fp-secret');
    github.addIssue(issue);

    const result = await processIssue(issue.number, {
      githubAPI: github,
      executeTier: async () => ({
        success: true,
        model: 'mock-model',
        patch: `diff --git a/src/app.ts b/src/app.ts\n+const apiKey = 'sk_live_1234567890abcdefghijklmn';`,
        tokens: [
          { model: 'deepseek', inputTokens: 120, outputTokens: 40, issueNumber: issue.number, tier: 1 }
        ],
        cost: 0.01
      }),
      runContext: baseRunContext(),
      safety: { budgetLimit: 5, maxDiffLines: 500, maxFiles: 10 }
    });

    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('secret_detected');
  });

  it('respects explicit path filters when provided', async () => {
    const github = new MockGitHubAPI();
    const issue = buildIssue(35, 'fp-path');
    github.addIssue(issue);

    const result = await processIssue(issue.number, {
      githubAPI: github,
      executeTier: async () => ({
        success: true,
        model: 'mock-model',
        patch: `diff --git a/docs/readme.md b/docs/readme.md\n+updated`,
        tokens: [
          { model: 'deepseek', inputTokens: 100, outputTokens: 30, issueNumber: issue.number, tier: 1 }
        ],
        cost: 0.01
      }),
      runContext: baseRunContext(),
      safety: { budgetLimit: 5, maxDiffLines: 500, maxFiles: 10, pathFilters: { include: ['src/'], exclude: ['docs/'] } }
    });

    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('path_filter_violation');
  });
});
