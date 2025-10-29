import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import { BudgetStore } from '../../../shared/budget/store.js';
import type { BudgetState } from '../../../shared/budget/types.js';

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

describe('BudgetStore', () => {
  let store: BudgetStore;
  let mockState: BudgetState;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new BudgetStore('/test/repo');

    // Create mock state with reset times in the future
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);

    const nextMonday = new Date(now);
    const daysUntilMonday = (8 - nextMonday.getUTCDay()) % 7 || 7;
    nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);

    const nextMonth = new Date(now);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
    nextMonth.setUTCHours(0, 0, 0, 0);

    mockState = {
      version: 1,
      currency: 'USD',
      config: {
        version: 1,
        currency: 'USD',
        caps: { daily: 0.066, weekly: 0.33, monthly: 1.0 },
        thresholds: { warn75: 75, warn90: 90, hard100: 100 },
        reservation: { tier1: 0.001, tier2: 0.004, tier3: 0.01 }
      },
      periods: {
        daily: {
          spent: 0,
          cap: 0.066,
          remaining: 0.066,
          reserved: 0,
          resetAt: tomorrow.toISOString()
        },
        weekly: {
          spent: 0,
          cap: 0.33,
          remaining: 0.33,
          reserved: 0,
          resetAt: nextMonday.toISOString()
        },
        monthly: {
          spent: 0,
          cap: 1.0,
          remaining: 1.0,
          reserved: 0,
          resetAt: nextMonth.toISOString()
        }
      },
      lastUpdated: now.toISOString()
    };
  });

  describe('load', () => {
    it('loads existing state from file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      const state = await store.load();

      expect(state).toEqual(mockState);
      expect(fs.readFile).toHaveBeenCalledWith(
        '/test/repo/.homeostat/state/budget.json',
        'utf-8'
      );
    });

    it('initializes defaults when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const state = await store.load();

      expect(state.version).toBe(1);
      expect(state.currency).toBe('USD');
      expect(state.periods.daily.cap).toBe(0.066);
      expect(state.periods.weekly.cap).toBe(0.33);
      expect(state.periods.monthly.cap).toBe(1.0);
      expect(state.periods.daily.spent).toBe(0);
      expect(state.periods.daily.remaining).toBe(0.066);
    });

    it('reads caps from environment variables', async () => {
      process.env.DAILY_BUDGET_CAP = '0.1';
      process.env.WEEKLY_BUDGET_CAP = '0.5';
      process.env.MONTHLY_BUDGET_CAP = '2.0';

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const state = await store.load();

      expect(state.periods.daily.cap).toBe(0.1);
      expect(state.periods.weekly.cap).toBe(0.5);
      expect(state.periods.monthly.cap).toBe(2.0);

      // Cleanup
      delete process.env.DAILY_BUDGET_CAP;
      delete process.env.WEEKLY_BUDGET_CAP;
      delete process.env.MONTHLY_BUDGET_CAP;
    });

    it('resets periods that have passed their reset time', async () => {
      // Use a date 2 hours ago (definitely in the past)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const stateWithPastReset = {
        ...mockState,
        periods: {
          daily: {
            spent: 0.05,
            cap: 0.066,
            remaining: 0.016,
            reserved: 0,
            resetAt: twoHoursAgo.toISOString()
          },
          weekly: {
            spent: 0.2,
            cap: 0.33,
            remaining: 0.13,
            reserved: 0,
            resetAt: twoHoursAgo.toISOString()
          },
          monthly: {
            spent: 0.8,
            cap: 1.0,
            remaining: 0.2,
            reserved: 0,
            resetAt: twoHoursAgo.toISOString()
          }
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stateWithPastReset));

      const state = await store.load();

      // All periods should be reset
      expect(state.periods.daily.spent).toBe(0);
      expect(state.periods.daily.remaining).toBe(0.066);
      expect(state.periods.weekly.spent).toBe(0);
      expect(state.periods.weekly.remaining).toBe(0.33);
      expect(state.periods.monthly.spent).toBe(0);
      expect(state.periods.monthly.remaining).toBe(1.0);

      // Reset times should be advanced by 1 period from the original time
      const originalTime = twoHoursAgo.getTime();
      expect(new Date(state.periods.daily.resetAt).getTime()).toBeGreaterThan(originalTime);
      expect(new Date(state.periods.weekly.resetAt).getTime()).toBeGreaterThan(originalTime);
      expect(new Date(state.periods.monthly.resetAt).getTime()).toBeGreaterThan(originalTime);
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();
    });

    it('writes state file to disk', async () => {
      await store.save();

      expect(fs.mkdir).toHaveBeenCalledWith('/test/repo/.homeostat/state', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/repo/.homeostat/state/budget.json',
        expect.any(String)
      );
    });

    it('updates lastUpdated timestamp', async () => {
      const beforeSave = Date.now();
      await store.save();

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedState = JSON.parse(writeCall[1] as string);
      const lastUpdated = new Date(savedState.lastUpdated).getTime();

      expect(lastUpdated).toBeGreaterThanOrEqual(beforeSave);
    });

    it('commits and pushes to git in GitHub Actions', async () => {
      process.env.GITHUB_ACTIONS = 'true';

      await store.save('test: budget state');

      expect(execSync).toHaveBeenCalledWith(
        'git config user.name "github-actions[bot]"',
        { cwd: '/test/repo' }
      );
      expect(execSync).toHaveBeenCalledWith(
        'git config user.email "github-actions[bot]@users.noreply.github.com"',
        { cwd: '/test/repo' }
      );
      expect(execSync).toHaveBeenCalledWith('git add .homeostat/state/budget.json', {
        cwd: '/test/repo'
      });
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git commit -m "test: budget state"'),
        { cwd: '/test/repo' }
      );
      expect(execSync).toHaveBeenCalledWith('git push', { cwd: '/test/repo' });

      delete process.env.GITHUB_ACTIONS;
    });

    it('uses default commit message if none provided', async () => {
      process.env.GITHUB_ACTIONS = 'true';

      await store.save();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('chore: update budget state [skip ci]'),
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
        }) // first push attempt
        .mockImplementationOnce(() => Buffer.from('')); // second push attempt

      await store.save();

      // Should call git push twice
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

      await expect(store.save()).resolves.not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Budget state saved locally but git push failed:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
      delete process.env.GITHUB_ACTIONS;
    });

    it('does not git commit/push outside GitHub Actions', async () => {
      delete process.env.GITHUB_ACTIONS;

      await store.save();

      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('reserve', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();
    });

    it('succeeds when budget is available in all periods', async () => {
      const result = await store.reserve({
        amount: 0.001,
        purpose: 'test_fix',
        correlationId: 'test_123'
      });

      expect(result.success).toBe(true);
      expect(result.reservationId).toBeDefined();
      expect(result.remaining).toBe(0.065); // 0.066 - 0.001
    });

    it('fails when daily budget would be exceeded', async () => {
      mockState.periods.daily.spent = 0.065;
      mockState.periods.daily.remaining = 0.001;
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const result = await store.reserve({
        amount: 0.002,
        purpose: 'test_fix',
        correlationId: 'test_123'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('daily budget cap');
      expect(result.breachedPeriod).toBe('daily');
    });

    it('fails when weekly budget would be exceeded', async () => {
      mockState.periods.weekly.spent = 0.32;
      mockState.periods.weekly.remaining = 0.01;
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const result = await store.reserve({
        amount: 0.02,
        purpose: 'test_fix',
        correlationId: 'test_123'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('weekly budget cap');
      expect(result.breachedPeriod).toBe('weekly');
    });

    it('fails when monthly budget would be exceeded', async () => {
      // Set monthly to be the constraining factor
      mockState.periods.daily.cap = 10.0; // High cap
      mockState.periods.daily.remaining = 10.0;
      mockState.periods.weekly.cap = 10.0; // High cap
      mockState.periods.weekly.remaining = 10.0;
      mockState.periods.monthly.spent = 0.95;
      mockState.periods.monthly.remaining = 0.05;
      mockState.periods.monthly.cap = 1.0;
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const result = await store.reserve({
        amount: 0.1,
        purpose: 'test_fix',
        correlationId: 'test_123'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('monthly budget cap');
      expect(result.breachedPeriod).toBe('monthly');
    });

    it('accounts for existing reservations', async () => {
      // First reservation
      await store.reserve({
        amount: 0.05,
        purpose: 'test_fix_1',
        correlationId: 'test_1'
      });

      // Second reservation should fail (0.066 - 0.05 = 0.016, less than 0.02)
      const result = await store.reserve({
        amount: 0.02,
        purpose: 'test_fix_2',
        correlationId: 'test_2'
      });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0.016); // 0.066 - 0.05
    });

    it('updates reserved amounts in all periods', async () => {
      await store.reserve({
        amount: 0.01,
        purpose: 'test_fix',
        correlationId: 'test_123'
      });

      const status = await store.getStatus();
      expect(status.periods.daily.reserved).toBe(0.01);
      expect(status.periods.weekly.reserved).toBe(0.01);
      expect(status.periods.monthly.reserved).toBe(0.01);
      expect(status.periods.daily.remaining).toBe(0.056); // 0.066 - 0.01
    });

    it('saves state with reservation', async () => {
      await store.reserve({
        amount: 0.004,
        purpose: 'test_fix',
        correlationId: 'test_123'
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/repo/.homeostat/state/budget.json',
        expect.any(String)
      );

      // Verify the saved state contains reservation
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedState = JSON.parse(writeCall[1] as string);
      expect(savedState.periods.daily.reserved).toBe(0.004);
    });
  });

  describe('refund', () => {
    let reservationId: string;

    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const result = await store.reserve({
        amount: 0.01,
        purpose: 'test_fix',
        correlationId: 'test_123'
      });
      reservationId = result.reservationId!;
    });

    it('commits actual spend and removes reservation', async () => {
      await store.refund({
        reservationId,
        actualAmount: 0.006,
        correlationId: 'test_123'
      });

      const status = await store.getStatus();
      expect(status.periods.daily.spent).toBe(0.006);
      expect(status.periods.daily.reserved).toBe(0);
      expect(status.periods.daily.remaining).toBeCloseTo(0.06, 10); // 0.066 - 0.006 with floating point tolerance
    });

    it('handles full reservation usage (no refund)', async () => {
      await store.refund({
        reservationId,
        actualAmount: 0.01,
        correlationId: 'test_123'
      });

      const status = await store.getStatus();
      expect(status.periods.daily.spent).toBe(0.01);
      expect(status.periods.daily.reserved).toBe(0);
      expect(status.periods.daily.remaining).toBe(0.056); // 0.066 - 0.01
    });

    it('handles zero usage (full refund)', async () => {
      await store.refund({
        reservationId,
        actualAmount: 0,
        correlationId: 'test_123'
      });

      const status = await store.getStatus();
      expect(status.periods.daily.spent).toBe(0);
      expect(status.periods.daily.reserved).toBe(0);
      expect(status.periods.daily.remaining).toBe(0.066); // full cap available
    });

    it('throws if reservation not found', async () => {
      await expect(
        store.refund({
          reservationId: 'invalid_id',
          actualAmount: 0.001,
          correlationId: 'test_123'
        })
      ).rejects.toThrow('Reservation invalid_id not found');
    });

    it('throws if actual amount exceeds reservation', async () => {
      await expect(
        store.refund({
          reservationId,
          actualAmount: 0.02,
          correlationId: 'test_123'
        })
      ).rejects.toThrow('Actual amount ($0.02) exceeds reservation ($0.01)');
    });

    it('updates all periods (daily, weekly, monthly)', async () => {
      await store.refund({
        reservationId,
        actualAmount: 0.007,
        correlationId: 'test_123'
      });

      const status = await store.getStatus();
      expect(status.periods.daily.spent).toBe(0.007);
      expect(status.periods.daily.reserved).toBe(0);
      expect(status.periods.weekly.spent).toBe(0.007);
      expect(status.periods.weekly.reserved).toBe(0);
      expect(status.periods.monthly.spent).toBe(0.007);
      expect(status.periods.monthly.reserved).toBe(0);
    });

    it('saves state after refund', async () => {
      await store.refund({
        reservationId,
        actualAmount: 0.005,
        correlationId: 'test_123'
      });

      expect(fs.writeFile).toHaveBeenCalled();

      // Verify the saved state contains actual spend
      const writeCalls = vi.mocked(fs.writeFile).mock.calls;
      const lastWriteCall = writeCalls[writeCalls.length - 1];
      const savedState = JSON.parse(lastWriteCall[1] as string);
      expect(savedState.periods.daily.spent).toBe(0.005);
    });
  });

  describe('checkAvailable', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();
    });

    it('returns available when budget exists in all periods', async () => {
      const result = await store.checkAvailable(0.01);

      expect(result.available).toBe(true);
      expect(result.remaining.daily).toBe(0.066);
      expect(result.remaining.weekly).toBe(0.33);
      expect(result.remaining.monthly).toBe(1.0);
    });

    it('returns unavailable when daily budget insufficient', async () => {
      mockState.periods.daily.spent = 0.06;
      mockState.periods.daily.remaining = 0.006;
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const result = await store.checkAvailable(0.01);

      expect(result.available).toBe(false);
      expect(result.reason).toContain('daily budget cap');
      expect(result.breachedPeriod).toBe('daily');
    });

    it('accounts for existing reservations', async () => {
      await store.reserve({
        amount: 0.05,
        purpose: 'test',
        correlationId: 'test_1'
      });

      const result = await store.checkAvailable(0.02);

      expect(result.available).toBe(false);
      expect(result.remaining.daily).toBe(0.016); // 0.066 - 0.05
    });
  });

  describe('checkThresholds', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();
    });

    it('returns no alerts when usage is below 75%', async () => {
      mockState.periods.daily.spent = 0.04; // 60% of 0.066
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const alerts = await store.checkThresholds();

      expect(alerts).toHaveLength(0);
    });

    it('returns 75% alert when usage crosses threshold', async () => {
      mockState.periods.daily.spent = 0.05; // 75.76% of 0.066
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const alerts = await store.checkThresholds();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].level).toBe(75);
      expect(alerts[0].period).toBe('daily');
      expect(alerts[0].usagePercent).toBeGreaterThanOrEqual(75);
    });

    it('returns 90% alert when usage crosses threshold', async () => {
      mockState.periods.daily.spent = 0.06; // 90.91% of 0.066
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const alerts = await store.checkThresholds();

      const alert90 = alerts.find((a) => a.level === 90);
      expect(alert90).toBeDefined();
      expect(alert90!.period).toBe('daily');
      expect(alert90!.usagePercent).toBeGreaterThanOrEqual(90);
    });

    it('returns 100% alert when budget exhausted', async () => {
      mockState.periods.daily.spent = 0.066; // 100% of 0.066
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const alerts = await store.checkThresholds();

      const alert100 = alerts.find((a) => a.level === 100);
      expect(alert100).toBeDefined();
      expect(alert100!.period).toBe('daily');
      expect(alert100!.usagePercent).toBe(100);
    });

    it('checks all periods (daily, weekly, monthly)', async () => {
      mockState.periods.daily.spent = 0.05; // 75%
      mockState.periods.weekly.spent = 0.3; // 90.9%
      mockState.periods.monthly.spent = 1.0; // 100%
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
      await store.load();

      const alerts = await store.checkThresholds();

      const periods = new Set(alerts.map((a) => a.period));
      expect(periods.size).toBe(3); // all three periods
      expect(periods.has('daily')).toBe(true);
      expect(periods.has('weekly')).toBe(true);
      expect(periods.has('monthly')).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('returns current budget state', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      const status = await store.getStatus();

      expect(status).toEqual(mockState);
    });

    it('loads state if not already loaded', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));

      const status = await store.getStatus();

      expect(fs.readFile).toHaveBeenCalled();
      expect(status.version).toBe(1);
    });
  });
});
