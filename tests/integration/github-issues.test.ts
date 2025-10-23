import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeComplexity, parseIssue } from '../../homeostat/routing/complexity-analyzer.js';
import { parseLoggerIssue } from '../../homeostat/routing/issue-parser.js';
import { MockGitHubAPI } from '../mocks/github-api';

const fixturesDir = path.join(process.cwd(), 'tests/fixtures/logger');

function loadFixture(name) {
  const filePath = path.join(fixturesDir, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('integration: github issue handling', () => {
  let mockApi;
  let originalRepo;

  beforeEach(() => {
    mockApi = new MockGitHubAPI();
    originalRepo = process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_REPOSITORY = 'littlebearapps/homeostat';
  });

  it('processes valid simple issue end-to-end', async () => {
    const issue = loadFixture('valid-simple.json');
    mockApi.addIssue(issue);
    const parsed = await parseIssue(issue.number, { fetchImpl: mockApi.createFetch() });
    expect(parsed.extension).toBe('NoteBridge');
    const routing = analyzeComplexity({ stackTrace: parsed.stackTrace });
    expect(routing.tier).toBe(1);
  });

  it('processes medium complexity issue', async () => {
    const issue = loadFixture('valid-medium.json');
    mockApi.addIssue(issue);
    const parsed = await parseIssue(issue.number, { fetchImpl: mockApi.createFetch() });
    expect(parsed.breadcrumbs.length).toBeGreaterThanOrEqual(3);
    const routing = analyzeComplexity({ stackTrace: parsed.stackTrace });
    expect(routing.tier).toBe(2);
    expect(routing.reviewer).toBe('gpt-5');
  });

  it('routes sensitive files to tier 3', async () => {
    const issue = loadFixture('valid-complex.json');
    mockApi.addIssue(issue);
    const parsed = await parseIssue(issue.number, { fetchImpl: mockApi.createFetch() });
    const routing = analyzeComplexity({ stackTrace: parsed.stackTrace });
    expect(routing.tier).toBe(3);
  });

  it('rejects issues missing required fields', async () => {
    const issue = loadFixture('invalid-missing-stacktrace.json');
    mockApi.addIssue(issue);
    await expect(parseIssue(issue.number, { fetchImpl: mockApi.createFetch() })).rejects.toThrow(
      /Missing required field: stackTrace/
    );
  });

  it('rejects malformed titles', async () => {
    const issue = loadFixture('invalid-malformed-title.json');
    mockApi.addIssue(issue);
    await expect(parseIssue(issue.number, { fetchImpl: mockApi.createFetch() })).rejects.toThrow(
      /Invalid issue/
    );
  });

  it('handles oversized stack traces without crashing', () => {
    const hugeStack = 'Error\n' + Array.from({ length: 2000 }).map((_, i) => `    at file${i}.js:1:1`).join('\n');
    const issue = {
      title: '[NoteBridge] Error: Overflow',
      body: `## Error Details\n- Extension: NoteBridge v1.0.0\n- Message: Overflow\n- Fingerprint: fp\n\n## Stack Trace\n\`${hugeStack}\n\`\n\n## Breadcrumbs\n1. Step`,
      labels: [{ name: 'robot' }]
    };
    const { parsed } = parseLoggerIssue(issue);
    expect(parsed.stackTrace.split('\n').length).toBeGreaterThan(1000);
  });

  it('supports reprocessing the same issue (idempotent)', async () => {
    const issue = loadFixture('valid-simple.json');
    mockApi.addIssue(issue);
    const fetch = mockApi.createFetch();
    const parsed1 = await parseIssue(issue.number, { fetchImpl: fetch });
    const parsed2 = await parseIssue(issue.number, { fetchImpl: fetch });
    expect(parsed1).toEqual(parsed2);
  });

  it('handles issues with additional labels', async () => {
    const issue = loadFixture('valid-simple.json');
    issue.labels.push({ name: 'notebridge' });
    mockApi.addIssue(issue);
    const parsed = await parseIssue(issue.number, { fetchImpl: mockApi.createFetch() });
    expect(parsed.labels).toContain('notebridge');
  });

  it('gracefully handles unicode breadcrumbs and RTL text', async () => {
    const issue = loadFixture('valid-simple.json');
    issue.body = issue.body.replace('## Breadcrumbs\n1. User clicked the sync button\n2. Background script invoked syncStorage\n', '## Breadcrumbs\n1. المستخدم فتح النافذة\n2. 用户 单击 同步\n');
    mockApi.addIssue(issue);
    const parsed = await parseIssue(issue.number, { fetchImpl: mockApi.createFetch() });
    expect(parsed.breadcrumbs).toHaveLength(2);
  });

  it('handles oversized issue bodies by truncating sanitization output', () => {
    const bigBody = '## Error Details\n- Extension: Big v1\n- Message: big\n- Fingerprint: big\n\n## Stack Trace\n```\n' +
      'A'.repeat(10000) +
      '\n```\n\n## Breadcrumbs\n1. step';
    const { parsed } = parseLoggerIssue({
      title: '[Big] Error: Overflow',
      body: bigBody,
      labels: [{ name: 'robot' }]
    });
    expect(parsed.stackTrace.length).toBeGreaterThan(1000);
  });

  afterEach(() => {
    process.env.GITHUB_REPOSITORY = originalRepo;
  });
});
