import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import {
  BudgetState,
  BudgetConfig,
  BudgetPeriod,
  ReservationRequest,
  ReservationResult,
  RefundRequest,
  BudgetCheckResult,
  AlertThreshold
} from './types.js';

/**
 * BudgetStore - Per-repo budget tracking with git persistence
 *
 * Architecture (GPT-5 validated):
 * - Git commit/push to `.homeostat/state/budget.json`
 * - Workflow concurrency group prevents races (no custom locking needed)
 * - Reservation/refund pattern for pre-flight protection
 * - UTC-only time boundaries (no timezone confusion)
 */
export class BudgetStore {
  private readonly statePath = '.homeostat/state/budget.json';
  private readonly repoRoot: string;
  private state: BudgetState | null = null;
  private reservations: Map<string, { amount: number; purpose: string }> = new Map();

  constructor(repoRoot: string = process.cwd()) {
    this.repoRoot = repoRoot;
  }

  /**
   * Load budget state from git-persisted file
   * Creates default state if file doesn't exist
   */
  async load(): Promise<BudgetState> {
    const fullPath = join(this.repoRoot, this.statePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      this.state = JSON.parse(content);

      // Check if periods need reset
      this.state = this.checkAndReset(this.state);

      return this.state;
    } catch (error) {
      // File doesn't exist or is corrupt - initialize defaults
      this.state = this.initializeDefaults();
      return this.state;
    }
  }

  /**
   * Save budget state and commit to git
   * Uses simple git commit + push (no API calls needed)
   */
  async save(commitMessage?: string): Promise<void> {
    if (!this.state) {
      throw new Error('BudgetStore: Cannot save - state not loaded');
    }

    const fullPath = join(this.repoRoot, this.statePath);

    // Ensure directory exists
    await fs.mkdir(dirname(fullPath), { recursive: true });

    // Update last modified timestamp
    this.state.lastUpdated = new Date().toISOString();

    // Write state file
    await fs.writeFile(fullPath, JSON.stringify(this.state, null, 2));

    // Git commit and push (if in GitHub Actions)
    if (process.env.GITHUB_ACTIONS) {
      try {
        // Configure git user (GitHub Actions bot)
        execSync('git config user.name "github-actions[bot]"', { cwd: this.repoRoot });
        execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: this.repoRoot });

        // Stage and commit
        execSync(`git add ${this.statePath}`, { cwd: this.repoRoot });
        const message = commitMessage || 'chore: update budget state [skip ci]';
        execSync(`git commit -m "${message}" || true`, { cwd: this.repoRoot });  // OK if no changes

        // Push with retry (2 attempts)
        for (let i = 0; i < 2; i++) {
          try {
            execSync('git push', { cwd: this.repoRoot });
            break;
          } catch (pushError) {
            if (i === 1) throw pushError;  // Last attempt failed
            // Retry after 1 second
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } catch (gitError) {
        console.warn('Budget state saved locally but git push failed:', gitError);
        // Don't throw - local state still updated
      }
    }
  }

  /**
   * Reserve budget for upcoming operation (pre-flight protection)
   * Uses conservative tier estimates to prevent overspend
   */
  async reserve(req: ReservationRequest): Promise<ReservationResult> {
    if (!this.state) {
      await this.load();
    }

    const state = this.state!;

    // Check if reservation would exceed any period cap
    for (const [periodName, period] of Object.entries(state.periods)) {
      const totalReserved = Array.from(this.reservations.values()).reduce(
        (sum, r) => sum + r.amount,
        0
      );
      const wouldExceed = period.spent + totalReserved + req.amount > period.cap;

      if (wouldExceed) {
        return {
          success: false,
          reason: `Reservation would exceed ${periodName} budget cap ($${period.cap})`,
          remaining: period.cap - period.spent - totalReserved,
          breachedPeriod: periodName as 'daily' | 'weekly' | 'monthly'
        };
      }
    }

    // Create reservation
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.reservations.set(reservationId, {
      amount: req.amount,
      purpose: req.purpose
    });

    // Update reserved amounts in state
    for (const period of Object.values(state.periods)) {
      period.reserved += req.amount;
      period.remaining = period.cap - period.spent - period.reserved;
    }

    // Save state with reservation
    await this.save(`chore: reserve $${req.amount.toFixed(4)} for ${req.purpose}`);

    return {
      success: true,
      reservationId,
      remaining: state.periods.daily.remaining
    };
  }

  /**
   * Commit reservation to actual spend and refund difference
   */
  async refund(req: RefundRequest): Promise<void> {
    if (!this.state) {
      await this.load();
    }

    const reservation = this.reservations.get(req.reservationId);
    if (!reservation) {
      throw new Error(`Reservation ${req.reservationId} not found`);
    }

    if (req.actualAmount > reservation.amount) {
      throw new Error(
        `Actual amount ($${req.actualAmount}) exceeds reservation ($${reservation.amount})`
      );
    }

    const state = this.state!;
    const refundAmount = reservation.amount - req.actualAmount;

    // Update all periods: remove reservation, add actual spend
    for (const period of Object.values(state.periods)) {
      period.reserved -= reservation.amount;
      period.spent += req.actualAmount;
      period.remaining = period.cap - period.spent - period.reserved;
    }

    // Remove reservation
    this.reservations.delete(req.reservationId);

    // Save state
    await this.save(
      `chore: commit $${req.actualAmount.toFixed(4)}, refund $${refundAmount.toFixed(4)}`
    );
  }

  /**
   * Check if budget is available (without reserving)
   */
  async checkAvailable(amount: number): Promise<BudgetCheckResult> {
    if (!this.state) {
      await this.load();
    }

    const state = this.state!;
    const totalReserved = Array.from(this.reservations.values()).reduce(
      (sum, r) => sum + r.amount,
      0
    );

    // Check each period
    for (const [periodName, period] of Object.entries(state.periods)) {
      const wouldExceed = period.spent + totalReserved + amount > period.cap;

      if (wouldExceed) {
        return {
          available: false,
          reason: `Would exceed ${periodName} budget cap ($${period.cap})`,
          remaining: {
            daily: state.periods.daily.cap - state.periods.daily.spent - totalReserved,
            weekly: state.periods.weekly.cap - state.periods.weekly.spent - totalReserved,
            monthly: state.periods.monthly.cap - state.periods.monthly.spent - totalReserved
          },
          breachedPeriod: periodName as 'daily' | 'weekly' | 'monthly'
        };
      }
    }

    return {
      available: true,
      remaining: {
        daily: state.periods.daily.remaining,
        weekly: state.periods.weekly.remaining,
        monthly: state.periods.monthly.remaining
      }
    };
  }

  /**
   * Get current budget status
   */
  async getStatus(): Promise<BudgetState> {
    if (!this.state) {
      await this.load();
    }
    return this.state!;
  }

  /**
   * Check for alert thresholds (75%, 90%, 100%)
   */
  async checkThresholds(): Promise<AlertThreshold[]> {
    if (!this.state) {
      await this.load();
    }

    const alerts: AlertThreshold[] = [];
    const thresholds = [75, 90, 100];

    for (const [periodName, period] of Object.entries(this.state!.periods)) {
      const usagePercent = (period.spent / period.cap) * 100;

      for (const threshold of thresholds) {
        if (usagePercent >= threshold) {
          alerts.push({
            level: threshold,
            period: periodName as 'daily' | 'weekly' | 'monthly',
            usagePercent,
            spent: period.spent,
            cap: period.cap
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Initialize default budget state
   */
  private initializeDefaults(): BudgetState {
    const now = new Date();

    // Daily resets at 00:00:00 UTC tomorrow
    const dailyReset = new Date(now);
    dailyReset.setUTCHours(24, 0, 0, 0);

    // Weekly resets at Monday 00:00:00 UTC
    const weeklyReset = new Date(now);
    const daysUntilMonday = (8 - weeklyReset.getUTCDay()) % 7 || 7;
    weeklyReset.setUTCDate(weeklyReset.getUTCDate() + daysUntilMonday);
    weeklyReset.setUTCHours(0, 0, 0, 0);

    // Monthly resets at 1st of next month 00:00:00 UTC
    const monthlyReset = new Date(now);
    monthlyReset.setUTCMonth(monthlyReset.getUTCMonth() + 1, 1);
    monthlyReset.setUTCHours(0, 0, 0, 0);

    // Read caps from environment or use defaults
    const dailyCap = parseFloat(process.env.DAILY_BUDGET_CAP || '0.066');
    const weeklyCap = parseFloat(process.env.WEEKLY_BUDGET_CAP || '0.33');
    const monthlyCap = parseFloat(process.env.MONTHLY_BUDGET_CAP || '1.0');

    const config: BudgetConfig = {
      version: 1,
      currency: 'USD',
      caps: {
        daily: dailyCap,
        weekly: weeklyCap,
        monthly: monthlyCap
      },
      thresholds: {
        warn75: 75,
        warn90: 90,
        hard100: 100
      },
      reservation: {
        tier1: 0.001,  // Conservative estimate for Tier 1
        tier2: 0.004,  // Conservative estimate for Tier 2
        tier3: 0.01    // Conservative estimate for Tier 3
      }
    };

    return {
      version: 1,
      currency: 'USD',
      config,
      periods: {
        daily: {
          spent: 0,
          cap: dailyCap,
          remaining: dailyCap,
          reserved: 0,
          resetAt: dailyReset.toISOString()
        },
        weekly: {
          spent: 0,
          cap: weeklyCap,
          remaining: weeklyCap,
          reserved: 0,
          resetAt: weeklyReset.toISOString()
        },
        monthly: {
          spent: 0,
          cap: monthlyCap,
          remaining: monthlyCap,
          reserved: 0,
          resetAt: monthlyReset.toISOString()
        }
      },
      lastUpdated: now.toISOString()
    };
  }

  /**
   * Check if periods need reset and reset them if needed
   */
  private checkAndReset(state: BudgetState): BudgetState {
    const now = new Date();

    for (const [periodName, period] of Object.entries(state.periods)) {
      const resetTime = new Date(period.resetAt);

      if (now >= resetTime) {
        // Reset this period
        period.spent = 0;
        period.reserved = 0;
        period.remaining = period.cap;

        // Calculate next reset time
        if (periodName === 'daily') {
          resetTime.setUTCDate(resetTime.getUTCDate() + 1);
        } else if (periodName === 'weekly') {
          resetTime.setUTCDate(resetTime.getUTCDate() + 7);
        } else if (periodName === 'monthly') {
          resetTime.setUTCMonth(resetTime.getUTCMonth() + 1);
        }

        period.resetAt = resetTime.toISOString();
      }
    }

    return state;
  }
}
