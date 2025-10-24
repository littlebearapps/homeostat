import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoConfig } from '../../../homeostat/multi-repo/repo-manager.js';
import { RepoManager } from '../../../homeostat/multi-repo/repo-manager.js';

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

const config: RepoConfig = {
  slug: 'littlebearapps/example',
  branch: 'main',
  maxPRsPerRun: 2,
  labels: ['homeostat'],
  pathFilters: {
    include: ['src/', 'content/'],
    exclude: ['tests/']
  },
  testCommand: 'npm test',
  confidenceThreshold: 0.8
};

describe('RepoManager', () => {
  beforeEach(() => {
    listMock.mockReset();
    updateMock.mockReset();
    createMock.mockReset();
    addLabelsMock.mockReset();
    createMock.mockResolvedValue({ data: { number: 42 } });
    updateMock.mockResolvedValue({});
    addLabelsMock.mockResolvedValue({});
  });

  it('applies include and exclude filters', () => {
    const manager = new RepoManager(config, 'token', { workdir: '/tmp' });
    expect(manager.applyPathFilters(['src/index.ts', 'content/background.ts'])).toBe(true);
    expect(manager.applyPathFilters(['docs/readme.md'])).toBe(false);
    expect(manager.applyPathFilters(['tests/example.test.ts'])).toBe(false);
  });

  it('detects existing pull requests by fingerprint', async () => {
    listMock.mockResolvedValue({
      data: [
        { number: 10, title: 'Fix bug (fp-123)', body: 'Contains fp-123' }
      ]
    });

    const manager = new RepoManager(config, 'token');
    await expect(manager.hasExistingPR('fp-123')).resolves.toBe(true);
  });

  it('creates new pull requests when fingerprint missing', async () => {
    listMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const manager = new RepoManager(config, 'token');
    const result = await manager.createOrUpdatePR({
      fingerprint: 'fp-new',
      title: 'feat: new fix',
      body: 'Details',
      branchName: 'feature/fp-new'
    });

    expect(result).toEqual({ number: 42, created: true });
    expect(createMock).toHaveBeenCalledWith({
      owner: 'littlebearapps',
      repo: 'example',
      title: 'feat: new fix',
      body: 'Details',
      head: 'feature/fp-new',
      base: 'main',
      draft: false
    });
    expect(addLabelsMock).toHaveBeenCalled();
  });

  it('updates existing pull requests when fingerprint matches', async () => {
    listMock.mockResolvedValueOnce({
      data: [
        { number: 7, title: 'Fix bug fp-77', body: 'fp-77 present' }
      ]
    });

    const manager = new RepoManager(config, 'token');
    const result = await manager.createOrUpdatePR({
      fingerprint: 'fp-77',
      title: 'fix: update',
      body: 'Updated body',
      branchName: 'feature/fp-77'
    });

    expect(result).toEqual({ number: 7, created: false });
    expect(updateMock).toHaveBeenCalledWith({
      owner: 'littlebearapps',
      repo: 'example',
      pull_number: 7,
      body: 'Updated body',
      title: 'fix: update',
      state: undefined,
      base: 'main'
    });
  });
});
