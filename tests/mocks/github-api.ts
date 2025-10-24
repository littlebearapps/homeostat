import fs from 'fs';

export interface MockIssue {
  number: number;
  title: string;
  body: string;
  labels?: Array<{ name: string }>;
  state?: 'open' | 'closed';
}

export interface MockPR {
  number: number;
  title: string;
  body: string;
  base: string;
  head: string;
  state: 'open' | 'merged' | 'closed';
}

interface MockRateLimit {
  remaining: number;
  reset: number;
}

interface MockResponseInit {
  status?: number;
  json?: unknown;
  text?: string;
}

function createResponse({ status = 200, json, text }: MockResponseInit) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return json;
    },
    async text() {
      return text ?? (typeof json === 'string' ? json : JSON.stringify(json));
    }
  };
}

export class MockGitHubAPI {
  private issues = new Map<string, MockIssue>();
  private comments = new Map<number, string[]>();
  private labels = new Map<number, string[]>();
  private prs: MockPR[] = [];
  private rateLimit: MockRateLimit = {
    remaining: 5000,
    reset: Math.floor(Date.now() / 1000) + 60
  };
  private repo = 'littlebearapps/homeostat';

  setRepository(repo: string) {
    this.repo = repo;
  }

  addIssue(issue: MockIssue) {
    const enriched: MockIssue = {
      ...issue,
      state: issue.state ?? 'open'
    };
    this.issues.set(this.buildIssueKey(enriched.number), enriched);
    if (enriched.labels) {
      this.labels.set(
        enriched.number,
        enriched.labels.map((label) => label.name)
      );
    }
  }

  getIssue(issueNumber: number): MockIssue | undefined {
    return this.issues.get(this.buildIssueKey(issueNumber));
  }

  createPR(pr: Omit<MockPR, 'number' | 'state'>): MockPR {
    const created: MockPR = {
      ...pr,
      number: this.prs.length + 1,
      state: 'open'
    };
    this.prs.push(created);
    return created;
  }

  addComment(issueNumber: number, comment: string): void {
    this.recordComment(issueNumber, comment);
  }

  addLabel(issueNumber: number, label: string): void {
    const labels = this.labels.get(issueNumber) ?? [];
    if (!labels.includes(label)) {
      labels.push(label);
      this.labels.set(issueNumber, labels);
    }
    const issue = this.getIssue(issueNumber);
    if (issue) {
      const currentLabels = new Set(issue.labels?.map((entry) => entry.name) ?? []);
      currentLabels.add(label);
      issue.labels = Array.from(currentLabels).map((name) => ({ name }));
      this.issues.set(this.buildIssueKey(issueNumber), issue);
    }
  }

  getComments(issueNumber: number) {
    return this.comments.get(issueNumber) ?? [];
  }

  getLabels(issueNumber: number) {
    return this.labels.get(issueNumber) ?? [];
  }

  getPRs(): MockPR[] {
    return [...this.prs];
  }

  reset(): void {
    this.issues.clear();
    this.comments.clear();
    this.labels.clear();
    this.prs = [];
    this.rateLimit = {
      remaining: 5000,
      reset: Math.floor(Date.now() / 1000) + 60
    };
  }

  setRateLimit(remaining: number, resetSecondsFromNow = 60) {
    this.rateLimit = {
      remaining,
      reset: Math.floor(Date.now() / 1000) + resetSecondsFromNow
    };
  }

  recordComment(issueNumber: number, comment: string) {
    const existing = this.comments.get(issueNumber) ?? [];
    existing.push(comment);
    this.comments.set(issueNumber, existing);
  }

  createFetch() {
    return async (url: string, options: { method?: string; body?: string } = {}) => {
      if (url.endsWith('/rate_limit')) {
        return createResponse({
          json: {
            resources: {
              core: {
                remaining: this.rateLimit.remaining,
                reset: this.rateLimit.reset
              }
            }
          }
        });
      }

      const issueMatch = url.match(/repos\/([^/]+\/[^/]+)\/issues\/(\d+)/);
      if (issueMatch) {
        const [, repo, number] = issueMatch;
        const key = `${repo}/issues/${number}`;
        const issue = this.issues.get(key);
        if (!issue) {
          return createResponse({ status: 404, text: 'Not Found' });
        }
        if (options.method && options.method.toUpperCase() === 'POST') {
          const body = options.body ? JSON.parse(options.body) : {};
          if (url.endsWith('/comments')) {
            this.addComment(Number(number), body.body ?? '');
            return createResponse({ status: 201, json: body });
          }
        }
        return createResponse({ json: issue });
      }

      return createResponse({ status: 400, text: 'Unhandled URL' });
    };
  }

  private buildIssueKey(issueNumber: number) {
    return `${this.repo}/issues/${issueNumber}`;
  }
}

export function loadFixture(path: string) {
  return JSON.parse(fs.readFileSync(path, 'utf-8')) as MockIssue;
}

export default MockGitHubAPI;
