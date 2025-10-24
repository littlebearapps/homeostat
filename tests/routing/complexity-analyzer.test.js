import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeComplexity,
  parseIssue
} from '../../homeostat/routing/complexity-analyzer.js';

const sampleIssue = {
  number: 42,
  title: "[NoteBridge] TypeError: Cannot read property 'sync' of undefined",
  body: `## Error Details\n- Extension: NoteBridge v1.2.0\n- Error Type: TypeError\n- Message: Cannot read property 'sync' of undefined\n- Timestamp: 2025-10-23T16:43:22Z\n- Fingerprint: abc123def456\n\n## Stack Trace\n\n\`\`\`\nError: Cannot read property 'sync' of undefined\n    at syncNotes (background/sync.js:42:15)\n\`\`\`\n\n## Breadcrumbs\n1. User clicked "Sync Now" button\n2. Called syncNotes() function\n3. Accessed chrome.storage.sync\n4. Error thrown at background/sync.js:42\n`,
  labels: [{ name: 'robot' }, { name: 'noteBridge' }],
  html_url: 'https://github.com/example/issues/42'
};

describe('parseIssue', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.GITHUB_REPOSITORY = 'littlebearapps/homeostat';
  });

  it('parses structured issue data per LOGGER-INTEGRATION.md', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleIssue });
    const parsed = await parseIssue(42, { fetchImpl: fetchMock });
    expect(parsed.extension).toBe('NoteBridge');
    expect(parsed.errorType).toBe('TypeError');
    expect(parsed.fingerprint).toBe('abc123def456');
    expect(parsed.breadcrumbs).toHaveLength(4);
  });

  it('throws when required fields missing', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...sampleIssue, body: '' }) });
    await expect(parseIssue(42, { fetchImpl: fetchMock })).rejects.toThrow('Missing required field');
  });
});

describe('analyzeComplexity', () => {
  it('routes to tier 3 when sensitive files detected', () => {
    const result = analyzeComplexity({ stackTrace: 'Error\n    at handler (/app/shared/api-keys.js:1:1)' });
    expect(result.tier).toBe(3);
    expect(result.model).toBe('gpt-5');
  });
});
