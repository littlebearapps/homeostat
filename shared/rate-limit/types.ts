/**
 * Rate limiter types for dual-window rate limiting (Phase 1A)
 *
 * Implements both burst protection (1min) and throughput control (24h)
 */

export interface RateLimitWindow {
  /** Maximum attempts in this window */
  max: number;
  /** Timestamps of attempts (ISO 8601 UTC) */
  timestamps: string[];
}

export interface RateLimitState {
  /** Schema version */
  version: number;
  /** Rate limit windows */
  windows: {
    /** 1-minute burst protection (5 attempts max) */
    perMinute: RateLimitWindow;
    /** 24-hour throughput control (20 attempts max per-repo) */
    perDay: RateLimitWindow;
  };
  /** Last time old attempts were pruned (ISO 8601 UTC) */
  lastPrunedAt: string;
}

export interface RateLimitCheckResult {
  /** Whether request can proceed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Current attempt counts */
  current: {
    perMinute: number;
    perDay: number;
  };
  /** Limits */
  limits: {
    perMinute: number;
    perDay: number;
  };
  /** When limits reset */
  resetsAt: {
    perMinute: string;  // 1 minute from now
    perDay: string;     // 24 hours from first attempt
  };
}
