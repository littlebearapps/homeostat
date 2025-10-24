import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processIssue } from '../../homeostat/orchestrator.js';
import { metrics } from '../../shared/observability/metrics.js';
import { MockGitHubAPI } from '../mocks/github-api';

function createValidIssue(number: number) {
  return {
    number,
    title: '[NoteBridge] TypeError: test error',
    body: `## Error Details\n- Extension: NoteBridge v1.2.0\n- Error Type: TypeError\n- Message: test error\n- Timestamp: 2025-10-24T10:00:00Z\n- Fingerprint: fp-${number}\n\n## Stack Trace\n\`\`\`\nError: test error\n    at background/file.js:10:5\n\`\`\`\n\n## Breadcrumbs\n1. Step one\n2. Step two`,
    labels: [{ name: 'robot' }],
    state: 'open' as const
  };
}

describe('e2e: failure modes', () => {
  let github: MockGitHubAPI;

  beforeEach(() => {
    github = new MockGitHubAPI();
    metrics.reset();
  });

  it('rejects issue with missing stack trace', async () => {
    const issue = {
      number: 10,
      title: '[NoteBridge] Some error',
      body: `## Error Details\n- Extension: NoteBridge v1.2.0\n- Error Type: TypeError\n- Fingerprint: missing-stack\n\n## Stack Trace\n\n## Breadcrumbs\n1. Step`,
      labels: [{ name: 'robot' }]
    };
    github.addIssue(issue as any);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });

    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('Missing required field: stackTrace');
    expect(github.getLabels(issue.number)).toContain('incomplete');
    const comment = github.getComments(issue.number)[0];
    expect(comment).toContain('Missing required field: stackTrace');
  });

  it('handles GitHub API 500 error with retry', async () => {
    const issue = createValidIssue(11);
    github.addIssue(issue);

    const baseCreatePR = github.createPR.bind(github);
    const createPRSpy = vi
      .fn<typeof github.createPR>()
      .mockRejectedValueOnce(new Error('GitHub API returned 500'))
      .mockImplementation((input) => baseCreatePR(input));
    // @ts-expect-error override for test scenario
    github.createPR = createPRSpy;

    const result = await processIssue(issue.number, {
      githubAPI: github,
      mockAI: true,
      delayFn: async () => {}
    });

    expect(result.success).toBe(true);
    expect(result.retries).toBe(1);
    expect(createPRSpy).toHaveBeenCalledTimes(2);
    expect(result.delayHistory?.[0]).toBe(200);
  });

  it('handles rate limit with exponential backoff', async () => {
    const issue = createValidIssue(12);
    github.addIssue(issue);

    const rateLimitError = new Error('Rate limit exceeded');
    (rateLimitError as any).status = 403;

    const baseCreatePR = github.createPR.bind(github);
    const createPRSpy = vi
      .fn<typeof github.createPR>()
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockImplementation((input) => baseCreatePR(input));
    // @ts-expect-error override for test scenario
    github.createPR = createPRSpy;

    const delayCalls: number[] = [];
    const delayFn = async (ms: number) => {
      delayCalls.push(ms);
    };

    const result = await processIssue(issue.number, {
      githubAPI: github,
      mockAI: true,
      delayFn
    });

    expect(result.success).toBe(true);
    expect(result.retries).toBe(2);
    expect(delayCalls).toEqual([1000, 2000]);
    expect(result.delayHistory).toEqual([1000, 2000]);
  });

  it('rejects oversize issue payloads', async () => {
    const bigBody = 'A'.repeat(100 * 1024 + 1);
    const issue = {
      number: 13,
      title: '[NoteBridge] Error: Oversized payload',
      body: `## Error Details\n- Extension: NoteBridge v1.2.0\n- Error Type: ErrorType\n- Message: Too big\n- Fingerprint: big\n\n## Stack Trace\n\`\`\`\n${bigBody}\n\`\`\`\n\n## Breadcrumbs\n1. Step`,
      labels: [{ name: 'robot' }]
    };
    github.addIssue(issue as any);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });

    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('Issue body exceeds 100KB limit');
  });

  it('does not create PR when tests fail', async () => {
    const issue = createValidIssue(14);
    github.addIssue(issue);

    const result = await processIssue(issue.number, {
      githubAPI: github,
      mockAI: true,
      mockTestFailure: true
    });

    expect(result.success).toBe(false);
    expect(result.fixGenerated).toBe(true);
    expect(result.testsPassed).toBe(false);
    expect(github.getPRs()).toHaveLength(0);
    expect(github.getComments(issue.number)[0]).toContain('⚠️ Tests failed');
  });
});
