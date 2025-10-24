import { Octokit } from '@octokit/rest';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';

const execAsync = promisify(execCallback);

export interface RepoConfig {
  slug: string;
  branch: string;
  maxPRsPerRun: number;
  labels: string[];
  pathFilters: { include: string[]; exclude: string[] };
  testCommand: string;
  confidenceThreshold: number;
}

export interface CreateOrUpdatePRParams {
  fingerprint: string;
  title: string;
  body: string;
  branchName: string;
  baseBranch?: string;
  draft?: boolean;
}

export interface RepoManagerOptions {
  workdir?: string;
}

export class RepoManager {
  private readonly octokit: Octokit;
  private readonly config: RepoConfig;
  private readonly workdir: string;

  constructor(config: RepoConfig, pat: string, options: RepoManagerOptions = {}) {
    this.config = config;
    this.octokit = new Octokit({ auth: pat });
    this.workdir = options.workdir ?? process.cwd();
  }

  async cloneShallow(targetDir?: string): Promise<string> {
    const [owner, repo] = this.config.slug.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository slug: ${this.config.slug}`);
    }

    const workdir = targetDir ? path.resolve(targetDir) : this.workdir;
    const cloneDir = path.join(workdir, repo);
    const cloneUrl = `https://github.com/${this.config.slug}.git`;

    await fs.mkdir(workdir, { recursive: true });
    await execAsync(
      `git clone --depth=1 --branch=${this.config.branch} ${cloneUrl} ${cloneDir}`
    );

    return cloneDir;
  }

  async hasExistingPR(fingerprint: string): Promise<boolean> {
    const existing = await this.findPRByFingerprint(fingerprint);
    return Boolean(existing);
  }

  async createOrUpdatePR(
    params: CreateOrUpdatePRParams
  ): Promise<{ number: number; created: boolean }> {
    const [owner, repo] = this.config.slug.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository slug: ${this.config.slug}`);
    }

    const existing = await this.findPRByFingerprint(params.fingerprint);
    if (existing) {
      await this.octokit.pulls.update({
        owner,
        repo,
        pull_number: existing.number,
        body: params.body,
        title: params.title,
        state: existing.state,
        base: params.baseBranch ?? this.config.branch
      });

      return { number: existing.number, created: false };
    }

    const openCount = await this.countOpenAutomationPRs();
    if (openCount >= this.config.maxPRsPerRun) {
      throw new Error(
        `Max PR budget reached for ${this.config.slug} (${openCount}/${this.config.maxPRsPerRun})`
      );
    }

    const { data: pr } = await this.octokit.pulls.create({
      owner,
      repo,
      title: params.title,
      body: params.body,
      head: params.branchName,
      base: params.baseBranch ?? this.config.branch,
      draft: params.draft ?? false
    });

    if (this.config.labels.length) {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: this.config.labels
      });
    }

    return { number: pr.number, created: true };
  }

  applyPathFilters(files: string[]): boolean {
    const { include, exclude } = this.config.pathFilters;
    if (!files.length) {
      return false;
    }

    const normalize = (value: string) => value.replace(/^[./]+/, '');
    const normalizedIncludes = include.map((pattern) => normalize(pattern));
    const normalizedExcludes = exclude.map((pattern) => normalize(pattern));

    const hasIncluded = files.some((file) =>
      normalizedIncludes.some((pattern) => this.matchesPattern(normalize(file), pattern))
    );

    if (!hasIncluded) {
      return false;
    }

    const hasExcluded = files.some((file) =>
      normalizedExcludes.some((pattern) => this.matchesPattern(normalize(file), pattern))
    );

    return !hasExcluded;
  }

  private matchesPattern(file: string, pattern: string): boolean {
    if (!pattern || pattern === '*') {
      return true;
    }

    if (pattern.endsWith('/')) {
      return file.startsWith(pattern);
    }

    return file === pattern || file.startsWith(`${pattern}/`);
  }

  private async findPRByFingerprint(fingerprint: string) {
    const [owner, repo] = this.config.slug.split('/');
    const { data: prs } = await this.octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100
    });

    return prs.find((pr) =>
      Boolean(pr.title?.includes(fingerprint) || pr.body?.includes(fingerprint))
    );
  }

  private async countOpenAutomationPRs(): Promise<number> {
    const [owner, repo] = this.config.slug.split('/');
    const { data: prs } = await this.octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100
    });

    if (!this.config.labels.length) {
      return prs.length;
    }

    return prs.filter((pr) => {
      const labels = pr.labels ?? [];
      return labels.some((label) =>
        typeof label === 'string'
          ? this.config.labels.includes(label)
          : label?.name && this.config.labels.includes(label.name)
      );
    }).length;
  }
}
