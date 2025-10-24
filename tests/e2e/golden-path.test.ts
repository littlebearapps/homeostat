import { beforeEach, describe, expect, it } from 'vitest';
import { processIssue } from '../../homeostat/orchestrator.js';
import { metrics } from '../../shared/observability/metrics.js';
import { MockGitHubAPI } from '../mocks/github-api';

function buildIssue({
  number,
  stackLines,
  fileCount = 1,
  sensitive = false
}: {
  number: number;
  stackLines: number;
  fileCount?: number;
  sensitive?: boolean;
}) {
  const files = Array.from({ length: fileCount }).map((_, index) =>
    sensitive && index === 0 ? 'manifest.json' : `background/file${index}.js`
  );

  const stack = Array.from({ length: stackLines }).map((_, index) => {
    const fileName = files[index % files.length];
    return `    at fn${index} (${fileName}:10:5)`;
  });

  return {
    number,
    title: `[NoteBridge] ErrorType: Example failure #${number}`,
    body: `## Error Details\n- Extension: NoteBridge v1.2.0\n- Error Type: ErrorType\n- Message: Example failure\n- Timestamp: 2025-10-24T10:00:00Z\n- Fingerprint: fp-${number}\n\n## Stack Trace\n\`\`\`\nError: Example failure\n${stack.join('\n')}\n\`\`\`\n\n## Breadcrumbs\n1. Step one\n2. Step two\n3. Step three`,
    labels: [{ name: 'robot' }],
    state: 'open' as const
  };
}

describe('e2e: golden path scenarios', () => {
  let github: MockGitHubAPI;

  beforeEach(() => {
    github = new MockGitHubAPI();
    metrics.reset();
  });

  it('processes Tier 1 issue (simple error)', async () => {
    const issue = buildIssue({ number: 1, stackLines: 3, fileCount: 1 });
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });

    expect(result.tier).toBe(1);
    expect(result.success).toBe(true);
    expect(result.prNumber).toBe(1);
    expect(github.getPRs()).toHaveLength(1);
    expect(github.getComments(issue.number)[0]).toContain('✅ Fix deployed');
  });

  it('processes Tier 2 issue (medium complexity)', async () => {
    const issue = buildIssue({ number: 2, stackLines: 8, fileCount: 2 });
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });

    expect(result.tier).toBe(2);
    expect(result.success).toBe(true);
    expect(github.getPRs()).toHaveLength(1);
  });

  it('processes Tier 3 issue (complex stack)', async () => {
    const issue = buildIssue({ number: 3, stackLines: 20, fileCount: 5 });
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });

    expect(result.tier).toBe(3);
    expect(result.model).toBe('gpt-5');
    expect(result.success).toBe(true);
  });

  it('escalates sensitive file issues to Tier 3', async () => {
    const issue = buildIssue({ number: 4, stackLines: 4, fileCount: 1, sensitive: true });
    github.addIssue(issue);

    const result = await processIssue(issue.number, { githubAPI: github, mockAI: true });

    expect(result.tier).toBe(3);
    expect(result.model).toBe('gpt-5');
    expect(result.success).toBe(true);
  });
});
