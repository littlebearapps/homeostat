import fs from 'fs';

export interface MockIssue {
  number: number;
  title: string;
  body: string;
  labels?: Array<{ name: string }>;
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
  private rateLimit: MockRateLimit = { remaining: 5000, reset: Math.floor(Date.now() / 1000) + 60 };
  private repo = 'littlebearapps/homeostat';

  setRepository(repo: string) {
    this.repo = repo;
  }

  addIssue(issue: MockIssue) {
    this.issues.set(`${this.repo}/issues/${issue.number}`, issue);
    if (issue.labels) {
      this.labels.set(issue.number, issue.labels.map((label) => label.name));
    }
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

  getComments(issueNumber: number) {
    return this.comments.get(issueNumber) ?? [];
  }

  getLabels(issueNumber: number) {
    return this.labels.get(issueNumber) ?? [];
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
            this.recordComment(Number(number), body.body ?? '');
            return createResponse({ status: 201, json: body });
          }
        }
        return createResponse({ json: issue });
      }

      return createResponse({ status: 400, text: 'Unhandled URL' });
    };
  }
}

export function loadFixture(path: string) {
  return JSON.parse(fs.readFileSync(path, 'utf-8')) as MockIssue;
}

export default MockGitHubAPI;
