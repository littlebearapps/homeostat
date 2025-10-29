/**
 * Budget types for per-repo cost management (Phase 1A)
 *
 * Architecture: Enhanced per-repo approach (GPT-5 validated)
 * - Git-persisted state (no central repository needed)
 * - Workflow concurrency for serialization
 * - Reservation/refund pattern for pre-flight protection
 */

export interface BudgetPeriod {
  /** Total amount spent in this period */
  spent: number;
  /** Budget cap for this period */
  cap: number;
  /** Remaining budget (cap - spent - reserved) */
  remaining: number;
  /** Active reservations not yet committed/refunded */
  reserved: number;
  /** When this period resets (ISO 8601 UTC) */
  resetAt: string;
}

export interface BudgetConfig {
  /** Version number for schema evolution */
  version: number;
  /** Currency (always USD) */
  currency: 'USD';
  /** Daily, weekly, monthly caps */
  caps: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  /** Alert thresholds (percentage of cap) */
  thresholds: {
    warn75: number;
    warn90: number;
    hard100: number;
  };
  /** Reservation constants per tier (conservative estimates) */
  reservation: {
    tier1: number;  // $0.001
    tier2: number;  // $0.004
    tier3: number;  // $0.010
  };
}

export interface BudgetState {
  /** Schema version */
  version: number;
  /** Currency */
  currency: 'USD';
  /** Configuration */
  config: BudgetConfig;
  /** Budget periods */
  periods: {
    daily: BudgetPeriod;
    weekly: BudgetPeriod;
    monthly: BudgetPeriod;
  };
  /** Last update timestamp (ISO 8601 UTC) */
  lastUpdated: string;
  /** Last git commit SHA (for tracking) */
  lastCommitSha?: string;
}

export interface ReservationRequest {
  /** Amount to reserve (from tier constant or estimate) */
  amount: number;
  /** Purpose for logging (e.g., "fix_issue_123") */
  purpose: string;
  /** Correlation ID for tracing */
  correlationId: string;
}

export interface ReservationResult {
  /** Whether reservation succeeded */
  success: boolean;
  /** Reservation ID (if successful) */
  reservationId?: string;
  /** Reason for failure (if unsuccessful) */
  reason?: string;
  /** Remaining budget after reservation */
  remaining: number;
  /** Which period was breached (if failed) */
  breachedPeriod?: 'daily' | 'weekly' | 'monthly';
}

export interface RefundRequest {
  /** Reservation ID to refund */
  reservationId: string;
  /** Actual amount spent (less than or equal to reservation) */
  actualAmount: number;
  /** Correlation ID for tracing */
  correlationId: string;
}

export interface BudgetCheckResult {
  /** Whether budget is available */
  available: boolean;
  /** Remaining budget in each period */
  remaining: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  /** Reason if not available */
  reason?: string;
  /** Which period would be breached */
  breachedPeriod?: 'daily' | 'weekly' | 'monthly';
}

export interface AlertThreshold {
  /** Threshold level (75, 90, 100) */
  level: number;
  /** Period that crossed threshold */
  period: 'daily' | 'weekly' | 'monthly';
  /** Current usage percentage */
  usagePercent: number;
  /** Amount spent */
  spent: number;
  /** Cap for this period */
  cap: number;
}
