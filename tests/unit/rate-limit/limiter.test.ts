import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import { RateLimiter } from '../../../shared/rate-limit/limiter.js';
import type { RateLimitState } from '../../../shared/rate-limit/types.js';

// Mock fs and child_process
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn()
  }
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}));

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  let mockState: RateLimitState;

  beforeEach(() => {
    vi.clearAllMocks();
    limiter = new RateLimiter('/test/repo');

    const now = new Date();
    mockState = {
      version: 1,
      windows: {
        perMinute: {
          max: 5,
          timestamps: []
        },
        perDay: {
          max: 20,
          timestamps: []
        }
      },
      lastPrunedAt: now.toISOString()
    };
  });

  describe('load', () => {
    it('loads existing state from file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      const state = await limiter.load();

      // Check properties individually (lastPrunedAt will be updated)
      expect(state.version).toBe(mockState.version);
      expect(state.windows).toEqual(mockState.windows);
      expect(fs.readFile).toHaveBeenCalledWith(
        '/test/repo/.homeostat/state/rate_limiter.json',
        'utf-8'
      );
    });

    it('initializes defaults when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const state = await limiter.load();

      expect(state.version).toBe(1);
      expect(state.windows.perMinute.max).toBe(5);
      expect(state.windows.perDay.max).toBe(20);
      expect(state.windows.perMinute.timestamps).toEqual([]);
      expect(state.windows.perDay.timestamps).toEqual([]);
    });

    it('reads limits from environment variables', async () => {
      process.env.RATE_LIMIT_PER_MINUTE = '10';
      process.env.RATE_LIMIT_PER_DAY = '50';

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      // Create new limiter after env vars are set
      const customLimiter = new RateLimiter('/test/repo');
      const state = await customLimiter.load();

      expect(state.windows.perMinute.max).toBe(10);
      expect(state.windows.perDay.max).toBe(50);

      // Cleanup
      delete process.env.RATE_LIMIT_PER_MINUTE;
      delete process.env.RATE_LIMIT_PER_DAY;
    });

    it('prunes old attempts on load', async () => {
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const stateWithOldAttempts = {
        ...mockState,
        windows: {
          perMinute: {
            max: 5,
            timestamps: [
              twoMinutesAgo.toISOString(), // Should be pruned (> 1 minute)
              oneHourAgo.toISOString(), // Should be pruned (> 1 minute)
              now.toISOString() // Should remain
            ]
          },
          perDay: {
            max: 20,
            timestamps: [
              twoDaysAgo.toISOString(), // Should be pruned (> 24 hours)
              oneHourAgo.toISOString(), // Should remain
              now.toISOString() // Should remain
            ]
          }
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithOldAttempts));

      const state = await limiter.load();

      expect(state.windows.perMinute.timestamps.length).toBe(1);
      expect(state.windows.perDay.timestamps.length).toBe(2);
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();
    });

    it('writes state file to disk', async () => {
      await limiter.save();

      expect(fs.mkdir).toHaveBeenCalledWith('/test/repo/.homeostat/state', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/repo/.homeostat/state/rate_limiter.json',
        expect.any(String)
      );
    });

    it('commits and pushes to git in GitHub Actions', async () => {
      process.env.GITHUB_ACTIONS = 'true';

      await limiter.save('test: rate limit state');

      expect(execSync).toHaveBeenCalledWith(
        'git config user.name "github-actions[bot]"',
        { cwd: '/test/repo' }
      );
      expect(execSync).toHaveBeenCalledWith(
        'git config user.email "github-actions[bot]@users.noreply.github.com"',
        { cwd: '/test/repo' }
      );
      expect(execSync).toHaveBeenCalledWith('git add .homeostat/state/rate_limiter.json', {
        cwd: '/test/repo'
      });
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git commit -m "test: rate limit state"'),
        { cwd: '/test/repo' }
      );
      expect(execSync).toHaveBeenCalledWith('git push', { cwd: '/test/repo' });

      delete process.env.GITHUB_ACTIONS;
    });

    it('uses default commit message if none provided', async () => {
      process.env.GITHUB_ACTIONS = 'true';

      await limiter.save();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('chore: update rate limiter state [skip ci]'),
        { cwd: '/test/repo' }
      );

      delete process.env.GITHUB_ACTIONS;
    });

    it('retries git push once on failure', async () => {
      process.env.GITHUB_ACTIONS = 'true';

      vi.mocked(execSync)
        .mockImplementationOnce(() => Buffer.from('')) // git config user.name
        .mockImplementationOnce(() => Buffer.from('')) // git config user.email
        .mockImplementationOnce(() => Buffer.from('')) // git add
        .mockImplementationOnce(() => Buffer.from('')) // git commit
        .mockImplementationOnce(() => {
          throw new Error('Push failed');
        }) // first push
        .mockImplementationOnce(() => Buffer.from('')); // second push

      await limiter.save();

      const pushCalls = vi.mocked(execSync).mock.calls.filter((call) => call[0] === 'git push');
      expect(pushCalls).toHaveLength(2);

      delete process.env.GITHUB_ACTIONS;
    });

    it('warns but does not throw if git push fails twice', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.mocked(execSync)
        .mockImplementationOnce(() => Buffer.from('')) // git config user.name
        .mockImplementationOnce(() => Buffer.from('')) // git config user.email
        .mockImplementationOnce(() => Buffer.from('')) // git add
        .mockImplementationOnce(() => Buffer.from('')) // git commit
        .mockImplementationOnce(() => {
          throw new Error('Push failed');
        }) // first push
        .mockImplementationOnce(() => {
          throw new Error('Push failed');
        }); // second push

      await expect(limiter.save()).resolves.not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Rate limiter state saved locally but git push failed:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
      delete process.env.GITHUB_ACTIONS;
    });

    it('does not git commit/push outside GitHub Actions', async () => {
      delete process.env.GITHUB_ACTIONS;

      await limiter.save();

      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('canProceed', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();
    });

    it('allows when no attempts recorded', async () => {
      const result = await limiter.canProceed();

      expect(result.allowed).toBe(true);
      expect(result.current.perMinute).toBe(0);
      expect(result.current.perDay).toBe(0);
    });

    it('allows when under both limits', async () => {
      const now = new Date();
      mockState.windows.perMinute.timestamps = [
        new Date(now.getTime() - 30 * 1000).toISOString(),
        new Date(now.getTime() - 20 * 1000).toISOString()
      ];
      mockState.windows.perDay.timestamps = [
        new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
      ];
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();

      const result = await limiter.canProceed();

      expect(result.allowed).toBe(true);
      expect(result.current.perMinute).toBe(2);
      expect(result.current.perDay).toBe(3);
    });

    it('blocks when per-minute limit reached', async () => {
      const now = new Date();
      mockState.windows.perMinute.timestamps = [
        new Date(now.getTime() - 50 * 1000).toISOString(),
        new Date(now.getTime() - 40 * 1000).toISOString(),
        new Date(now.getTime() - 30 * 1000).toISOString(),
        new Date(now.getTime() - 20 * 1000).toISOString(),
        new Date(now.getTime() - 10 * 1000).toISOString()
      ];
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();

      const result = await limiter.canProceed();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Per-minute rate limit exceeded');
      expect(result.current.perMinute).toBe(5);
    });

    it('blocks when per-day limit reached', async () => {
      const now = new Date();
      const timestamps = Array.from({ length: 20 }, (_, i) => {
        return new Date(now.getTime() - (i + 1) * 60 * 60 * 1000).toISOString();
      });
      mockState.windows.perDay.timestamps = timestamps;
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();

      const result = await limiter.canProceed();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Per-day rate limit exceeded');
      expect(result.current.perDay).toBe(20);
    });

    it('provides reset times when blocked', async () => {
      const now = new Date();
      mockState.windows.perMinute.timestamps = Array.from({ length: 5 }, () => {
        return new Date(now.getTime() - 30 * 1000).toISOString();
      });
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();

      const result = await limiter.canProceed();

      expect(result.allowed).toBe(false);
      expect(result.resetsAt.perMinute).toBeDefined();
      expect(result.resetsAt.perDay).toBeDefined();

      const resetTime = new Date(result.resetsAt.perMinute);
      expect(resetTime.getTime()).toBeGreaterThan(Date.now());
    });

    it('prunes old attempts before checking', async () => {
      const now = new Date();
      mockState.windows.perMinute.timestamps = [
        new Date(now.getTime() - 2 * 60 * 1000).toISOString(), // > 1 minute, should be pruned
        new Date(now.getTime() - 30 * 1000).toISOString() // < 1 minute, should remain
      ];
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();

      const result = await limiter.canProceed();

      expect(result.allowed).toBe(true);
      expect(result.current.perMinute).toBe(1); // Only 1 after pruning
    });
  });

  describe('recordAttempt', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();
    });

    it('adds timestamp to both windows', async () => {
      const beforeRecord = Date.now();
      await limiter.recordAttempt();
      const afterRecord = Date.now();

      const status = await limiter.getStatus();
      expect(status.windows.perMinute.timestamps.length).toBe(1);
      expect(status.windows.perDay.timestamps.length).toBe(1);

      const timestamp = new Date(status.windows.perMinute.timestamps[0]).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeRecord);
      expect(timestamp).toBeLessThanOrEqual(afterRecord);
    });

    it('updates lastPrunedAt timestamp', async () => {
      const beforeRecord = Date.now();
      await limiter.recordAttempt();

      const status = await limiter.getStatus();
      const lastPruned = new Date(status.lastPrunedAt).getTime();
      expect(lastPruned).toBeGreaterThanOrEqual(beforeRecord);
    });

    it('saves state after recording', async () => {
      await limiter.recordAttempt();

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/repo/.homeostat/state/rate_limiter.json',
        expect.any(String)
      );
    });

    it('records multiple attempts', async () => {
      await limiter.recordAttempt();
      await limiter.recordAttempt();
      await limiter.recordAttempt();

      const status = await limiter.getStatus();
      expect(status.windows.perMinute.timestamps.length).toBe(3);
      expect(status.windows.perDay.timestamps.length).toBe(3);
    });
  });

  describe('getStatus', () => {
    it('returns current rate limiter state', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      const status = await limiter.getStatus();

      expect(status).toEqual(mockState);
    });

    it('loads state if not already loaded', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      const status = await limiter.getStatus();

      expect(fs.readFile).toHaveBeenCalled();
      expect(status.version).toBe(1);
    });
  });

  describe('integration: full workflow', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    });

    it('allows 5 requests in one minute', async () => {
      await limiter.load();

      for (let i = 0; i < 5; i++) {
        const check = await limiter.canProceed();
        expect(check.allowed).toBe(true);
        await limiter.recordAttempt();
      }

      const status = await limiter.getStatus();
      expect(status.windows.perMinute.timestamps.length).toBe(5);
    });

    it('blocks 6th request in one minute', async () => {
      // Create limiter with fresh state
      const freshLimiter = new RateLimiter('/test/repo');
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      await freshLimiter.load();

      // Record 5 attempts
      for (let i = 0; i < 5; i++) {
        await freshLimiter.recordAttempt();
      }

      // Reload to get updated state
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(await freshLimiter.getStatus()));
      await freshLimiter.load();

      // 6th attempt should be blocked
      const check = await freshLimiter.canProceed();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Per-minute rate limit exceeded');
    });

    it('allows 20 requests in 24 hours', async () => {
      await limiter.load();

      // Simulate requests spread over time (1 hour apart)
      const now = new Date();
      for (let i = 0; i < 20; i++) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000).toISOString();
        mockState.windows.perDay.timestamps.push(timestamp);
      }
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();

      const status = await limiter.getStatus();
      expect(status.windows.perDay.timestamps.length).toBe(20);
    });

    it('blocks 21st request in 24 hours', async () => {
      await limiter.load();

      // Simulate 20 requests spread over time
      const now = new Date();
      for (let i = 0; i < 20; i++) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000).toISOString();
        mockState.windows.perDay.timestamps.push(timestamp);
      }
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await limiter.load();

      // 21st attempt should be blocked
      const check = await limiter.canProceed();
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Per-day rate limit exceeded');
    });
  });
});
