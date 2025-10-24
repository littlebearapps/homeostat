import { describe, expect, it, vi } from 'vitest';
import { ensureGitHubQuota } from '../../homeostat/execution/ai-utils.js';

function createResponse({ status = 200, json }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return json;
    }
  };
}

describe('integration: rate limit handling', () => {
  it('returns immediately when rate limit is healthy', async () => {
    const fetchMock = vi.fn(async () =>
      createResponse({
        json: {
          resources: {
            core: { remaining: 5000, reset: Math.floor(Date.now() / 1000) + 60 }
          }
        }
      })
    );
    await ensureGitHubQuota(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits when rate limit is low', async () => {
    vi.useFakeTimers();
    const resetTime = Math.floor(Date.now() / 1000) + 1;
    const fetchMock = vi.fn(async () =>
      createResponse({
        json: {
          resources: {
            core: { remaining: 10, reset: resetTime }
          }
        }
      })
    );
    const waitPromise = ensureGitHubQuota(fetchMock);
    await vi.advanceTimersByTimeAsync(1000);
    await waitPromise;
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores non-ok responses gracefully', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    await ensureGitHubQuota(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
