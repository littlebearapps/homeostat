import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processIssue, type RunContext } from '../../homeostat/orchestrator.js';
import { RepoManager, type RepoConfig } from '../../homeostat/multi-repo/repo-manager.js';
import { metrics } from '../../shared/observability/metrics.js';
import { MockGitHubAPI } from '../mocks/github-api';

const listMock = vi.fn();
const updateMock = vi.fn();
const createMock = vi.fn();
const addLabelsMock = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    pulls: {
      list: listMock,
      update: updateMock,
      create: createMock
    },
    issues: {
      addLabels: addLabelsMock
    }
  }))
}));

const REPO_CONFIG: RepoConfig = {
  slug: 'littlebearapps/example',
  branch: 'main',
  maxPRsPerRun: 2,
  labels: ['homeostat'],
  pathFilters: {
    include: ['src/'],
    exclude: ['tests/', 'docs/']
  },
  testCommand: 'npm test',
  confidenceThreshold: 0.8
};

function resetState(libraryPath: string, attemptPath: string) {
  metrics.reset();
  fs.writeFileSync(attemptPath, '[]\n');
  fs.writeFileSync(
    libraryPath,
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

function buildIssue(repo: string, number: number, fingerprint: string) {
  return {
    number,
    title: `[${repo}] TypeError: Example failure #${number}`,
    body: `## Error Details\n- Extension: ${repo} v1.0.0\n- Error Type: TypeError\n- Message: Example failure\n- Timestamp: 2025-10-24T10:00:00Z\n- Fingerprint: ${fingerprint}\n\n## Stack Trace\n\`\`\`\nError: Example failure\n    at main (src/background.ts:10:5)\n\`\`\`\n\n## Breadcrumbs\n1. Step one\n2. Step two\n3. Step three`,
    labels: [{ name: 'robot' }],
    state: 'open' as const
  };
}

describe.sequential('e2e: multi-repo workflow', () => {
  let tempDir: string;
  let libraryPath: string;
  let attemptPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-repo-'));
    libraryPath = path.join(tempDir, 'library.json');
    attemptPath = path.join(tempDir, 'attempt-store.json');
    process.env.HOMEOSTAT_PATTERN_LIBRARY_PATH = libraryPath;
    process.env.HOMEOSTAT_ATTEMPT_STORE_PATH = attemptPath;
    resetState(libraryPath, attemptPath);
    listMock.mockReset();
    updateMock.mockReset();
    createMock.mockReset();
    addLabelsMock.mockReset();
    createMock.mockResolvedValue({ data: { number: 99 } });
    updateMock.mockResolvedValue({});
    addLabelsMock.mockResolvedValue({});
    listMock.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    delete process.env.HOMEOSTAT_PATTERN_LIBRARY_PATH;
    delete process.env.HOMEOSTAT_ATTEMPT_STORE_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
    listMock.mockReset();
    updateMock.mockReset();
    createMock.mockReset();
    addLabelsMock.mockReset();
  });

  it('processes configured repositories sequentially', async () => {
    const repos = ['convert-my-file', 'notebridge', 'palette-kit'];
    const runContext: RunContext = {
      totalCost: 0,
      patternsUsed: 0,
      zeroCostFixes: 0,
      cooldowns: 0,
      fingerprints: []
    };

    const executionOrder: string[] = [];

    for (const [index, repo] of repos.entries()) {
      const github = new MockGitHubAPI();
      github.setRepository(`littlebearapps/${repo}`);
      const issue = buildIssue(repo, index + 1, `fp-${repo}`);
      github.addIssue(issue);

      const result = await processIssue(issue.number, {
        githubAPI: github,
        executeTier: async () => {
          executionOrder.push(repo);
          return {
            success: true,
            model: 'mock-model',
            patch: `diff --git a/src/index.js b/src/index.js\n+console.log('${repo}');`,
            tokens: [
              {
                model: 'deepseek',
                inputTokens: 120,
                outputTokens: 40,
                issueNumber: issue.number,
                tier: 1
              }
            ],
            cost: 0.01
          };
        },
        runContext,
        repoSlug: `littlebearapps/${repo}`,
        safety: { budgetLimit: 5 }
      });

      expect(result.success).toBe(true);
      expect(github.getPRs()).toHaveLength(1);
    }

    expect(executionOrder).toEqual(repos);
    expect(runContext.totalCost).toBeCloseTo(0.03, 5);
  });

  it('enforces per-repository PR budget', async () => {
    listMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          { labels: [{ name: 'homeostat' }] },
          { labels: [{ name: 'homeostat' }] }
        ]
      });

    const manager = new RepoManager(REPO_CONFIG, 'token');

    await manager.createOrUpdatePR({
      fingerprint: 'fp-one',
      title: 'fix: first',
      body: 'Details',
      branchName: 'feature/fp-one'
    });

    await expect(
      manager.createOrUpdatePR({
        fingerprint: 'fp-two',
        title: 'fix: second',
        body: 'Details',
        branchName: 'feature/fp-two'
      })
    ).rejects.toThrow(/Max PR budget/);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('skips patches violating path filters', async () => {
    const github = new MockGitHubAPI();
    const issue = buildIssue('convert-my-file', 10, 'fp-path');
    github.addIssue(issue);

    const result = await processIssue(issue.number, {
      githubAPI: github,
      executeTier: async () => ({
        success: true,
        model: 'mock-model',
        patch: `diff --git a/tests/example.test.ts b/tests/example.test.ts\n+console.log('test');`,
        tokens: [
          {
            model: 'deepseek',
            inputTokens: 200,
            outputTokens: 80,
            issueNumber: issue.number,
            tier: 1
          }
        ],
        cost: 0.01
      }),
      runContext: {
        totalCost: 0,
        patternsUsed: 0,
        zeroCostFixes: 0,
        cooldowns: 0,
        fingerprints: []
      },
      repoSlug: 'littlebearapps/convert-my-file',
      safety: {
        budgetLimit: 5,
        pathFilters: { include: ['src/'], exclude: ['tests/'] }
      }
    });

    expect(result.rejected).toBe(true);
    expect(result?.reason).toBe('path_filter_violation');
    expect(github.getPRs()).toHaveLength(0);
  });

  it('updates existing PRs when fingerprint already exists', async () => {
    listMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValue({
        data: [
          { number: 7, title: 'fix: fingerprint fp-dupe', body: 'contains fp-dupe', labels: [{ name: 'homeostat' }] }
        ]
      });

    const manager = new RepoManager(REPO_CONFIG, 'token');

    const first = await manager.createOrUpdatePR({
      fingerprint: 'fp-dupe',
      title: 'fix: fingerprint fp-dupe',
      body: 'Initial',
      branchName: 'feature/fp-dupe'
    });

    expect(first.created).toBe(true);

    const second = await manager.createOrUpdatePR({
      fingerprint: 'fp-dupe',
      title: 'fix: fingerprint fp-dupe',
      body: 'Updated body',
      branchName: 'feature/fp-dupe'
    });

    expect(second.created).toBe(false);
    expect(updateMock).toHaveBeenCalled();
  });

  it('processes repos without overlapping executions', async () => {
    const github = new MockGitHubAPI();
    const issues = [
      buildIssue('convert-my-file', 21, 'fp-21'),
      buildIssue('convert-my-file', 22, 'fp-22')
    ];
    issues.forEach((issue) => github.addIssue(issue));

    const concurrency: number[] = [];
    let active = 0;

    for (const issue of issues) {
      await processIssue(issue.number, {
        githubAPI: github,
        executeTier: async () => {
          active += 1;
          concurrency.push(active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return {
            success: true,
            model: 'mock-model',
            patch: `diff --git a/src/index.js b/src/index.js\n+console.log('${issue.number}');`,
            tokens: [
              {
                model: 'deepseek',
                inputTokens: 150,
                outputTokens: 50,
                issueNumber: issue.number,
                tier: 1
              }
            ],
            cost: 0.01
          };
        },
        runContext: {
          totalCost: 0,
          patternsUsed: 0,
          zeroCostFixes: 0,
          cooldowns: 0,
          fingerprints: []
        },
        repoSlug: 'littlebearapps/convert-my-file',
        safety: { budgetLimit: 5 }
      });
    }

    expect(Math.max(...concurrency)).toBe(1);
  });
});
