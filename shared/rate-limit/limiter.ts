import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { RateLimitState, RateLimitWindow, RateLimitCheckResult } from './types.js';

/**
 * RateLimiter - Dual-window rate limiting (Phase 1A)
 *
 * Implements two sliding windows:
 * - 1-minute burst protection: 5 attempts max (stops immediate spikes)
 * - 24-hour throughput control: 20 attempts max per-repo
 *
 * Architecture: Git-persisted state, workflow concurrency prevents races
 */
export class RateLimiter {
  private readonly statePath = '.homeostat/state/rate_limiter.json';
  private readonly repoRoot: string;
  private state: RateLimitState | null = null;

  // Rate limit configuration
  private readonly PER_MINUTE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '5', 10);
  private readonly PER_DAY_LIMIT = parseInt(process.env.RATE_LIMIT_PER_DAY || '20', 10);

  constructor(repoRoot: string = process.cwd()) {
    this.repoRoot = repoRoot;
  }

  /**
   * Load rate limiter state from git-persisted file
   */
  async load(): Promise<RateLimitState> {
    const fullPath = join(this.repoRoot, this.statePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      this.state = JSON.parse(content);

      // Prune old attempts
      this.state = this.pruneOldAttempts(this.state);

      return this.state;
    } catch (error) {
      // File doesn't exist - initialize defaults
      this.state = this.initializeDefaults();
      return this.state;
    }
  }

  /**
   * Save rate limiter state and commit to git
   */
  async save(commitMessage?: string): Promise<void> {
    if (!this.state) {
      throw new Error('RateLimiter: Cannot save - state not loaded');
    }

    const fullPath = join(this.repoRoot, this.statePath);

    // Ensure directory exists
    await fs.mkdir(dirname(fullPath), { recursive: true });

    // Write state file
    await fs.writeFile(fullPath, JSON.stringify(this.state, null, 2));

    // Git commit and push (if in GitHub Actions)
    if (process.env.GITHUB_ACTIONS) {
      try {
        // Configure git user
        execSync('git config user.name "github-actions[bot]"', { cwd: this.repoRoot });
        execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: this.repoRoot });

        // Stage and commit
        execSync(`git add ${this.statePath}`, { cwd: this.repoRoot });
        const message = commitMessage || 'chore: update rate limiter state [skip ci]';
        execSync(`git commit -m "${message}" || true`, { cwd: this.repoRoot });

        // Push with retry
        for (let i = 0; i < 2; i++) {
          try {
            execSync('git push', { cwd: this.repoRoot });
            break;
          } catch (pushError) {
            if (i === 1) throw pushError;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } catch (gitError) {
        console.warn('Rate limiter state saved locally but git push failed:', gitError);
      }
    }
  }

  /**
   * Check if request can proceed (both windows must allow)
   */
  async canProceed(): Promise<RateLimitCheckResult> {
    if (!this.state) {
      await this.load();
    }

    const state = this.state!;
    const now = new Date();

    // Prune old attempts first
    this.state = this.pruneOldAttempts(state);

    // Check per-minute window
    const perMinuteCount = state.windows.perMinute.timestamps.length;
    if (perMinuteCount >= state.windows.perMinute.max) {
      const oldestAttempt = new Date(state.windows.perMinute.timestamps[0]);
      const resetAt = new Date(oldestAttempt.getTime() + 60 * 1000);

      return {
        allowed: false,
        reason: `Per-minute rate limit exceeded (${perMinuteCount}/${state.windows.perMinute.max} in last minute)`,
        current: {
          perMinute: perMinuteCount,
          perDay: state.windows.perDay.timestamps.length
        },
        limits: {
          perMinute: state.windows.perMinute.max,
          perDay: state.windows.perDay.max
        },
        resetsAt: {
          perMinute: resetAt.toISOString(),
          perDay: this.calculateDayReset(state.windows.perDay).toISOString()
        }
      };
    }

    // Check per-day window
    const perDayCount = state.windows.perDay.timestamps.length;
    if (perDayCount >= state.windows.perDay.max) {
      return {
        allowed: false,
        reason: `Per-day rate limit exceeded (${perDayCount}/${state.windows.perDay.max} in last 24h)`,
        current: {
          perMinute: perMinuteCount,
          perDay: perDayCount
        },
        limits: {
          perMinute: state.windows.perMinute.max,
          perDay: state.windows.perDay.max
        },
        resetsAt: {
          perMinute: new Date(now.getTime() + 60 * 1000).toISOString(),
          perDay: this.calculateDayReset(state.windows.perDay).toISOString()
        }
      };
    }

    // Both windows allow - proceed
    return {
      allowed: true,
      current: {
        perMinute: perMinuteCount,
        perDay: perDayCount
      },
      limits: {
        perMinute: state.windows.perMinute.max,
        perDay: state.windows.perDay.max
      },
      resetsAt: {
        perMinute: new Date(now.getTime() + 60 * 1000).toISOString(),
        perDay: this.calculateDayReset(state.windows.perDay).toISOString()
      }
    };
  }

  /**
   * Record an attempt (call after checking canProceed)
   */
  async recordAttempt(): Promise<void> {
    if (!this.state) {
      await this.load();
    }

    const now = new Date().toISOString();

    // Add to both windows
    this.state!.windows.perMinute.timestamps.push(now);
    this.state!.windows.perDay.timestamps.push(now);

    // Update last pruned timestamp
    this.state!.lastPrunedAt = now;

    // Save state
    await this.save('chore: record rate limit attempt [skip ci]');
  }

  /**
   * Get current rate limit status
   */
  async getStatus(): Promise<RateLimitState> {
    if (!this.state) {
      await this.load();
    }
    return this.state!;
  }

  /**
   * Initialize default rate limiter state
   */
  private initializeDefaults(): RateLimitState {
    return {
      version: 1,
      windows: {
        perMinute: {
          max: this.PER_MINUTE_LIMIT,
          timestamps: []
        },
        perDay: {
          max: this.PER_DAY_LIMIT,
          timestamps: []
        }
      },
      lastPrunedAt: new Date().toISOString()
    };
  }

  /**
   * Prune old attempts outside the sliding windows
   */
  private pruneOldAttempts(state: RateLimitState): RateLimitState {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Prune per-minute window (remove attempts > 1 minute old)
    state.windows.perMinute.timestamps = state.windows.perMinute.timestamps.filter(
      (ts) => new Date(ts) > oneMinuteAgo
    );

    // Prune per-day window (remove attempts > 24 hours old)
    state.windows.perDay.timestamps = state.windows.perDay.timestamps.filter(
      (ts) => new Date(ts) > oneDayAgo
    );

    state.lastPrunedAt = now.toISOString();

    return state;
  }

  /**
   * Calculate when the per-day window resets (24h from oldest attempt)
   */
  private calculateDayReset(window: RateLimitWindow): Date {
    if (window.timestamps.length === 0) {
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const oldestAttempt = new Date(window.timestamps[0]);
    return new Date(oldestAttempt.getTime() + 24 * 60 * 60 * 1000);
  }
}
