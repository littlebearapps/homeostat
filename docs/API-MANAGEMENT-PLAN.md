# API Management Implementation Plan

**Version**: 1.0
**Date**: 2025-10-28
**Status**: Proposal (awaiting approval)
**Effort Estimate**: 44-60 hours (3-4 weeks)

---

## Executive Summary

This plan addresses the need for comprehensive API cost management in Homeostat as it scales from 1 to 3+ Chrome extensions. While current projected costs are low ($5.77-$6.99/year), the theoretical maximum without controls is $1,460/year—a 243× risk multiplier.

**Proposed Solution**: 6-component system providing budget enforcement, rate limiting, pre-flight cost estimation, real-time tracking, multi-level alerts, and visibility dashboards.

**Hard Cap**: $36/year (97.5% risk reduction)
**Soft Target**: $9.28/year (maintains current trajectory)
**Operational Overhead**: ~2 hours/month

---

## Problem Statement

### Current State

**Strengths**:
- Per-fix budget cap ($0.01)
- Per-run budget cap ($1.00)
- Cost tracking in benchmarks
- JSONL telemetry artifacts

**Critical Gaps**:
1. **No pre-flight cost estimation** - Commits to fix before knowing cost
2. **No daily/weekly/monthly caps** - Only per-run limits
3. **No per-repository budget allocation** - All repos share global budget
4. **No rate limiting beyond hop count** - Same issue can be re-triggered
5. **Concurrent workflow risks** - Multiple issues triggering simultaneously
6. **Retry storms** - 2 attempts × multiple tiers can multiply costs

### Risk Scenarios

| Scenario | Description | Cost Impact |
|----------|-------------|-------------|
| Error storm | 10 concurrent issues with retries | $0.40 |
| Retry storm | 20 complex Tier 3 issues/day | $1.04/day |
| Theoretical max | Unlimited concurrent errors | $1,460/year |

**Current Protection**: Per-run cap ($1.00) × 4 runs/day = $4/day theoretical max
**Gap**: No protection across runs, no daily/weekly/monthly caps

---

## Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Homeostat Orchestrator                  │
└───────────┬──────────────────────────────────┬──────────────┘
            │                                  │
            ▼                                  ▼
    ┌───────────────┐                 ┌───────────────┐
    │ Rate Limiter  │                 │ Budget Store  │
    │               │                 │               │
    │ • 50/24h glob │                 │ • $0.25/day   │
    │ • 20/24h repo │                 │ • $1.00/week  │
    │ • Sliding win │                 │ • $3.00/month │
    └───────────────┘                 └───────────────┘
            │                                  │
            └──────────────┬───────────────────┘
                           ▼
                  ┌─────────────────┐
                  │ Pre-flight Cost │
                  │    Estimator    │
                  │                 │
                  │ • Tier probs    │
                  │ • Confidence    │
                  │ • Budget check  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Real-time Cost │
                  │     Tracker     │
                  │                 │
                  │ • Record spend  │
                  │ • Atomic write  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Alert Notifier  │
                  │                 │
                  │ • 50/75/90/100% │
                  │ • Slack + GitHub│
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Cost Dashboard │
                  │                 │
                  │ • CLI reporting │
                  │ • Trends/status │
                  └─────────────────┘
```

### Budget Targets

| Period | Limit | Rationale |
|--------|-------|-----------|
| **Daily** | $0.25 | 15× current projection (growth buffer) |
| **Weekly** | $1.00 | Aligns with 7-day average |
| **Monthly** | $3.00 | $36/year hard cap |
| **Per-repo** | $0.10/day | Fair allocation across 3 extensions |

### Rate Limits

| Scope | Window | Limit | Purpose |
|-------|--------|-------|---------|
| **Global** | 24h sliding | 50 attempts | Prevent org-wide storms |
| **Per-repo** | 24h sliding | 20 attempts | Prevent single-repo abuse |

---

## GPT-5 Expert Analysis

### Key Recommendations

**🔴 CRITICAL: Multi-repo State Sharing**

**Issue**: File-based JSON on GitHub Actions runners cannot coordinate across repositories. Each workflow runs on isolated runners with no shared filesystem.

**Recommendation**: Use a central GitHub repository as the backing store (JSON files committed via GitHub Contents API). This maintains "no external services" while enabling org-wide state sharing.

**Implementation**:
- Central repo: `littlebearapps/homeostat-state` (private)
- Concurrency: Optimistic locking with SHA precondition (If-Match)
- Conflict resolution: Retry with exponential backoff + jitter
- Security: GitHub App or PAT with restricted write access

**🔴 CRITICAL: Atomicity and Over-spend Protection**

**Issue**: Current "check then spend" approach has race condition. Multiple jobs can pass pre-flight check but collectively exceed budget.

**Recommendation**: Reserve-then-commit semantics:
1. **Reserve**: Pre-flight creates reservation with amount, TTL, actor_id, run_id
2. **Enforce**: Cap against `(actual_spend + outstanding_reservations)`
3. **Commit**: Replace reservation with actual spend; expire stale reservations via sweeper

**Benefit**: Prevents race conditions and handles job cancellation gracefully.

**🟡 IMPORTANT: Budget Alignment**

**Issue**: Per-repo daily caps ($0.10 × 3 repos = $0.30/day) exceed global daily cap ($0.25/day).

**Recommendation**: Derive per-repo caps from global budget with headroom:
- 80% of global allocated equally across repos
- 20% pooled for flexibility
- Example: $0.25 daily → 80% = $0.20 → 3 repos = $0.066/repo + $0.05 pool

**🟡 IMPORTANT: Rate Limiting Granularity**

**Recommendation**: Add short-window burst limiter (per-minute) in addition to 24h constraints:
- Global: 10 attempts/minute (stops immediate spikes)
- Per-repo: 5 attempts/minute
- Keep 24h sliding window for overall throughput control

**🟡 IMPORTANT: Fail-closed by Default**

**Issue**: Current plan suggests fail-open for cost enforcement.

**Recommendation**: Default to fail-closed when caps are breached. Provide break-glass override:
- Environment variable + signed-off label
- OR manual approval in protected GitHub environment
- Log emergency alert for every override use

**🟢 ENHANCEMENT: Observability & Audit**

**Recommendations**:
- Assign `correlation_id` per run, propagate to all logs/state writes
- Keep append-only audit log in state repo (`.homeostat/audit/{YYYY-MM}.ndjson`)
- Track: spends, reserves, releases, over-budget denials, overrides

**🟢 ENHANCEMENT: Testing & Resilience**

**Recommendations**:
- Injectable clock for time-based tests
- State adapter interface (GitHub-backed vs file-based for local/tests)
- Concurrency tests: Simulate 10-50 parallel reservations
- Chaos tests: Inject transient write failures, validate idempotent retries

---

## Revised Architecture (Incorporating GPT-5 Feedback)

### State Storage

**Central State Repository**: `littlebearapps/homeostat-state` (private)

```
.homeostat/
├── budgets/index.json          # Current budget state
├── reservations/{period_id}.json  # Active reservations
└── audit/{YYYY-MM}.ndjson      # Append-only audit log
```

**budgets/index.json**:
```json
{
  "revision": 42,
  "last_update_at": "2025-10-28T12:34:56Z",
  "last_writer": "run_18867383352",
  "periods": {
    "daily": {
      "period_id": "2025-10-28",
      "cap": 0.25,
      "actual_spend": 0.12,
      "outstanding_reservations": 0.05,
      "remaining": 0.08,
      "resets_at": "2025-10-29T00:00:00Z",
      "per_repo": {
        "convert-my-file": {
          "cap": 0.066,
          "spend": 0.04,
          "reservations": 0.02
        },
        "notebridge": {
          "cap": 0.066,
          "spend": 0.05,
          "reservations": 0.01
        },
        "palette-kit": {
          "cap": 0.066,
          "spend": 0.03,
          "reservations": 0.02
        }
      },
      "pool": {
        "cap": 0.05,
        "spend": 0.00,
        "reservations": 0.00
      }
    },
    "weekly": { "...": "..." },
    "monthly": { "...": "..." }
  }
}
```

**reservations/{period_id}.json**:
```json
[
  {
    "id": "res_cmf_18867383352_001",
    "repo": "convert-my-file",
    "actor": "github-actions[bot]",
    "run_id": "18867383352",
    "created_at": "2025-10-28T12:30:00Z",
    "ttl_sec": 900,
    "expires_at": "2025-10-28T12:45:00Z",
    "amount": 0.02,
    "purpose": "fix_issue_14",
    "state": "reserved",
    "correlation_id": "corr_18867383352"
  }
]
```

**audit/{YYYY-MM}.ndjson**:
```jsonl
{"ts":"2025-10-28T12:30:00Z","type":"reserve","repo":"convert-my-file","run_id":"18867383352","amount":0.02,"period_id":"2025-10-28","before":{"spend":0.04,"reservations":0.00},"after":{"spend":0.04,"reservations":0.02},"correlation_id":"corr_18867383352"}
{"ts":"2025-10-28T12:35:00Z","type":"commit","repo":"convert-my-file","run_id":"18867383352","amount":0.015,"period_id":"2025-10-28","before":{"spend":0.04,"reservations":0.02},"after":{"spend":0.055,"reservations":0.00},"correlation_id":"corr_18867383352"}
```

### Reserve-Commit Lifecycle

```typescript
// 1. Pre-flight: Create reservation
const estimate = await costEstimator.estimate(issue);
const reservation = await budgetStore.reserve({
  repo,
  amount: estimate.estimated_cost,
  purpose: `fix_issue_${issue.number}`,
  ttl_sec: 900, // 15 minutes (workflow timeout)
  correlation_id
});

// 2. Check: Budget available after reservation?
if (!reservation.success) {
  logger.warn('Budget insufficient', {
    estimated: estimate.estimated_cost,
    available: reservation.remaining
  });
  return; // Fail-closed
}

// 3. Process: Generate fix (existing logic)
const result = await generateFix(issue, costTracker);

// 4. Commit: Replace reservation with actual spend
await budgetStore.commit({
  reservation_id: reservation.id,
  actual_amount: costTracker.getTotalCost(),
  correlation_id
});

// 5. Cleanup: Sweeper expires stale reservations (hourly cron)
```

### Concurrency Handling

**Optimistic Locking** (GitHub Contents API):

```typescript
async function updateBudgetState(
  updateFn: (state: BudgetState) => BudgetState
): Promise<void> {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // 1. Fetch current state + SHA
      const { data, sha } = await octokit.repos.getContent({
        owner: 'littlebearapps',
        repo: 'homeostat-state',
        path: '.homeostat/budgets/index.json'
      });

      const currentState = JSON.parse(
        Buffer.from(data.content, 'base64').toString()
      );

      // 2. Apply update
      const newState = updateFn(currentState);
      newState.revision = currentState.revision + 1;
      newState.last_writer = process.env.GITHUB_RUN_ID;
      newState.last_update_at = new Date().toISOString();

      // 3. Commit with SHA precondition (If-Match)
      await octokit.repos.createOrUpdateFileContents({
        owner: 'littlebearapps',
        repo: 'homeostat-state',
        path: '.homeostat/budgets/index.json',
        message: `chore: update budget state (rev ${newState.revision})`,
        content: Buffer.from(JSON.stringify(newState, null, 2)).toString('base64'),
        sha // Fails if another writer modified the file
      });

      return; // Success

    } catch (error) {
      if (error.status === 409) {
        // Conflict - another writer modified the file
        attempt++;
        const jitter = Math.random() * 1000;
        const backoff = Math.min(1000 * 2 ** attempt, 10000);
        await sleep(backoff + jitter);
        continue;
      }
      throw error; // Other errors fail immediately
    }
  }

  throw new Error('Max retries exceeded - budget state update failed');
}
```

---

## Component Specifications

### 1. Budget Store (`shared/budget/store.ts`)

**Responsibilities**:
- Load/save budget state from GitHub Contents API
- Reserve budget for upcoming operations
- Commit reservations to actual spend
- Expire stale reservations (sweeper)
- Check budget availability

**Key Methods**:
```typescript
class BudgetStore {
  async reserve(req: ReserveRequest): Promise<ReserveResult>;
  async commit(req: CommitRequest): Promise<void>;
  async release(reservationId: string): Promise<void>;
  async checkAvailable(amount: number, repo: string): Promise<AvailabilityResult>;
  async sweep(): Promise<SweepResult>; // Expire stale reservations
  async getStatus(): Promise<BudgetState>;
}
```

**State Adapter Interface**:
```typescript
interface StateAdapter {
  load(path: string): Promise<{ data: any; etag: string }>;
  save(path: string, data: any, etag: string): Promise<void>;
}

class GitHubStateAdapter implements StateAdapter {
  // Uses Contents API with optimistic locking
}

class FileStateAdapter implements StateAdapter {
  // Uses local filesystem (dev/tests only)
}
```

### 2. Rate Limiter (`shared/rate-limit/limiter.ts`)

**Responsibilities**:
- Track fix attempts in sliding windows (24h + 1min)
- Enforce global and per-repo limits
- Prune old attempts outside windows

**Key Methods**:
```typescript
class RateLimiter {
  canProceed(repo: string): { allowed: boolean; reason?: string };
  recordAttempt(repo: string): void;
  pruneOldAttempts(): void;
  getStatus(): RateLimitState;
}
```

**Dual Windows**:
- **24h sliding window**: 50 global, 20 per-repo (overall throughput)
- **1min buckets**: 10 global, 5 per-repo (burst protection)

### 3. Pre-flight Cost Estimator (`shared/cost/estimator.ts`)

**Responsibilities**:
- Analyze issue complexity
- Estimate tier probabilities from historical data
- Calculate expected cost with confidence interval

**Key Methods**:
```typescript
class CostEstimator {
  async estimate(issue: GitHubIssue): Promise<CostEstimate>;
  private getTierProbabilities(complexity: number): TierProbs;
  private getConfidence(complexity: number): 'high' | 'medium' | 'low';
}

interface CostEstimate {
  estimated_cost: number;
  confidence: 'high' | 'medium' | 'low';
  breakdown: {
    tier1_probability: number;
    tier2_probability: number;
    tier3_probability: number;
    expected_tier1_cost: number;
    expected_tier2_cost: number;
    expected_tier3_cost: number;
  };
}
```

**Tier Probabilities** (historical averages from `.homeostat/attempt-store.json`):
- Complexity < 3: 80% Tier 1, 15% Tier 2, 5% Tier 3
- Complexity 3-6: 60% Tier 1, 30% Tier 2, 10% Tier 3
- Complexity > 6: 30% Tier 1, 50% Tier 2, 20% Tier 3

### 4. Real-time Cost Tracker (`shared/cost/tracker.ts`)

**Enhancement to Existing Class**:
```typescript
class CostTracker {
  constructor(
    private budgetStore: BudgetStore,
    private repo: string,
    private reservationId: string
  ) {}

  async trackUsage(usage: TokenUsage): Promise<void> {
    const cost = this.calculateCost(usage);

    // Record spending (updates reservation → actual spend)
    await this.budgetStore.recordSpend({
      reservation_id: this.reservationId,
      amount: cost,
      repo: this.repo
    });

    // Original validation
    if (cost > this.PER_FIX_BUDGET) {
      throw new Error(`Fix exceeded budget: $${cost.toFixed(4)}`);
    }

    this.usage.push(usage);
  }
}
```

### 5. Alert System (`shared/alerts/notifier.ts`)

**Responsibilities**:
- Monitor budget usage at multiple thresholds
- Send alerts via Slack webhooks and GitHub issues
- Deduplicate alerts within cooldown periods

**Key Methods**:
```typescript
class AlertNotifier {
  async checkAndAlert(budgetState: BudgetState): Promise<void>;
  private async sendAlert(level: AlertLevel, alert: Alert): Promise<void>;
  private shouldAlert(level: string, scope: string): boolean; // Deduplication
}

type AlertLevel = 'info' | 'warning' | 'critical' | 'emergency';

interface Alert {
  title: string;
  message: string;
  severity: AlertLevel;
  budget_state: BudgetState;
  suggested_actions?: string[];
}
```

**Alert Thresholds**:
| Threshold | Level | Channels |
|-----------|-------|----------|
| 50% | Info | Logs only |
| 75% | Warning | Slack |
| 90% | Critical | Slack + GitHub Issue |
| 100% | Emergency | Slack + GitHub Issue + Email |

**Deduplication**: One alert per (period, threshold, repo/global) to prevent spam.

### 6. Cost Dashboard (`scripts/cost-dashboard.ts`)

**Responsibilities**:
- Display current budget status (daily/weekly/monthly)
- Show per-repo breakdown
- Visualize rate limit usage
- Historical trend analysis

**CLI Interface**:
```bash
npm run dashboard               # Current status
npm run dashboard --period week # Weekly view
npm run dashboard --repo cmf    # Repo-specific
```

**Sample Output**:
```
📊 Homeostat Cost Dashboard

💰 Budget Status:
┌─────────┬─────────┬────────┬───────────┬────────┐
│ Period  │ Limit   │ Spent  │ Remaining │ Usage  │
├─────────┼─────────┼────────┼───────────┼────────┤
│ Daily   │ $0.25   │ $0.12  │ $0.13     │ 48.0%  │
│ Weekly  │ $1.00   │ $0.45  │ $0.55     │ 45.0%  │
│ Monthly │ $3.00   │ $0.89  │ $2.11     │ 29.7%  │
└─────────┴─────────┴────────┴───────────┴────────┘

📦 Per-Repository (Daily):
┌──────────────────┬──────────────┬──────────────┬────────┐
│ Repository       │ Daily Limit  │ Spent Today  │ Usage  │
├──────────────────┼──────────────┼──────────────┼────────┤
│ convert-my-file  │ $0.066       │ $0.04        │ 60.6%  │
│ notebridge       │ $0.066       │ $0.05        │ 75.8%  │
│ palette-kit      │ $0.066       │ $0.03        │ 45.5%  │
│ pool (shared)    │ $0.05        │ $0.00        │  0.0%  │
└──────────────────┴──────────────┴──────────────┴────────┘

🚦 Rate Limits (24h window):
┌─────────────────┬──────────┬────────┬───────────┐
│ Scope           │ Attempts │ Limit  │ Remaining │
├─────────────────┼──────────┼────────┼───────────┤
│ Global          │ 23       │ 50     │ 27        │
│ convert-my-file │ 8        │ 20     │ 12        │
│ notebridge      │ 10       │ 20     │ 10        │
│ palette-kit     │ 5        │ 20     │ 15        │
└─────────────────┴──────────┴────────┴───────────┘

📈 Projections:
- Current daily rate: $0.12/day
- Projected monthly: $3.60 (⚠️ 20% over budget)
- Projected annual: $43.80 (⚠️ 22% over budget)
```

---

## Integration with Orchestrator

**Updated Workflow** (`homeostat/orchestrator.ts`):

```typescript
async function processIssue(issue: GitHubIssue): Promise<void> {
  const repo = parseRepoSlug(issue.repository_url);
  const correlationId = `corr_${process.env.GITHUB_RUN_ID}`;

  logger.info('Processing issue', {
    issue_number: issue.number,
    repo,
    correlation_id: correlationId
  });

  // 1. Rate limit check (dual windows: 1min + 24h)
  const rateLimitCheck = await rateLimiter.canProceed(repo);
  if (!rateLimitCheck.allowed) {
    logger.warn('Rate limit exceeded', {
      reason: rateLimitCheck.reason,
      correlation_id: correlationId
    });
    await gh.createComment(issue, `⏸️ Rate limit exceeded: ${rateLimitCheck.reason}`);
    return; // Fail-closed
  }

  // 2. Pre-flight cost estimation
  const estimate = await costEstimator.estimate(issue);
  logger.info('Cost estimate', {
    estimate,
    correlation_id: correlationId
  });

  // 3. Reserve budget (with concurrency protection)
  const reservation = await budgetStore.reserve({
    repo,
    amount: estimate.estimated_cost,
    purpose: `fix_issue_${issue.number}`,
    ttl_sec: 900, // 15 minutes (workflow timeout)
    correlation_id: correlationId
  });

  if (!reservation.success) {
    logger.warn('Budget insufficient', {
      estimated: estimate.estimated_cost,
      available: reservation.remaining,
      correlation_id: correlationId
    });
    await alertNotifier.sendAlert('budget_blocked', {
      issue,
      estimate,
      reservation
    });
    await gh.createComment(issue,
      `💰 Budget insufficient for fix (estimated $${estimate.estimated_cost.toFixed(4)}, available $${reservation.remaining.toFixed(4)})`
    );
    return; // Fail-closed
  }

  // 4. Record rate limit attempt
  await rateLimiter.recordAttempt(repo);

  // 5. Process fix (existing logic)
  const costTracker = new CostTracker(
    budgetStore,
    repo,
    reservation.id,
    correlationId
  );

  try {
    const result = await generateFix(issue, costTracker);

    // 6. Commit reservation to actual spend
    await budgetStore.commit({
      reservation_id: reservation.id,
      actual_amount: costTracker.getTotalCost(),
      correlation_id: correlationId
    });

    logger.info('Fix completed', {
      cost: costTracker.getTotalCost(),
      correlation_id: correlationId
    });

  } catch (error) {
    // 7. Release reservation on failure
    await budgetStore.release(reservation.id);
    throw error;
  }

  // 8. Check budget alerts (50%/75%/90%/100%)
  const updatedBudget = await budgetStore.getStatus();
  await alertNotifier.checkAndAlert(updatedBudget);
}
```

---

## Phased Rollout

### Phase 1: Foundation (Week 1, 16-20 hours)

**Goal**: Core budget and rate limiting with GitHub-backed state

**Tasks**:
- [ ] Create `littlebearapps/homeostat-state` repository (private)
- [ ] Implement `GitHubStateAdapter` with optimistic locking
- [ ] Implement `BudgetStore` with reserve-commit lifecycle
- [ ] Implement `RateLimiter` with dual windows (1min + 24h)
- [ ] Integrate into orchestrator (reserve → process → commit)
- [ ] Unit tests (20+ tests, >95% coverage)

**Deliverables**:
- `shared/budget/store.ts` (~300 lines)
- `shared/budget/adapters.ts` (~200 lines)
- `shared/rate-limit/limiter.ts` (~200 lines)
- `tests/budget-store.test.ts` (~250 lines)
- `tests/rate-limiter.test.ts` (~150 lines)

**Success Criteria**:
- Budget state synchronized across 3 repos
- Concurrent reservations handled without overspend
- Rate limits enforced (no false positives)

### Phase 2: Intelligence (Week 2, 12-16 hours)

**Goal**: Pre-flight estimation and multi-level alerts

**Tasks**:
- [ ] Implement `CostEstimator` with historical tier probabilities
- [ ] Implement `AlertNotifier` with Slack + GitHub integrations
- [ ] Configure alert thresholds (50%/75%/90%/100%)
- [ ] Add per-repo budget allocation (80% allocated, 20% pool)
- [ ] Integration tests (10+ tests)

**Deliverables**:
- `shared/cost/estimator.ts` (~200 lines)
- `shared/alerts/notifier.ts` (~250 lines)
- `tests/cost-estimator.test.ts` (~150 lines)
- `tests/alert-notifier.test.ts` (~100 lines)

**Success Criteria**:
- Cost estimation within 20% of actual for 80%+ of fixes
- Alerts trigger at correct thresholds
- Zero missed "budget exceeded" alerts

### Phase 3: Observability (Week 3, 8-12 hours)

**Goal**: Dashboard, reporting, and operational utilities

**Tasks**:
- [ ] Implement CLI dashboard with budget/rate/cost views
- [ ] Create `npm run budget:status` script
- [ ] Create `npm run budget:reset` utility
- [ ] Add historical trend analysis (7-day, 30-day)
- [ ] Documentation (runbooks, troubleshooting)

**Deliverables**:
- `scripts/cost-dashboard.ts` (~280 lines)
- `scripts/budget-status.ts` (~100 lines)
- `scripts/reset-budget.ts` (~80 lines)
- `docs/RUNBOOKS.md` (~500 lines)

**Success Criteria**:
- Dashboard accessible in <5 seconds
- Accurate budget/rate/cost data
- Historical trends visible

### Phase 4: Validation (Week 4, 8-12 hours)

**Goal**: E2E testing, threshold tuning, production readiness

**Tasks**:
- [ ] E2E tests with synthetic issues (5+ scenarios)
- [ ] Property tests (budget never negative, etc.)
- [ ] Chaos tests (inject transient failures)
- [ ] Tune thresholds based on real usage
- [ ] Security review (PII, secrets, access control)
- [ ] Release validation checklist

**Deliverables**:
- `tests/e2e.test.ts` (~200 lines)
- `tests/property.test.ts` (~100 lines)
- `tests/chaos.test.ts` (~80 lines)
- `docs/SECURITY-REVIEW.md` (~300 lines)

**Success Criteria**:
- 100% of fixes respect budget limits
- 100% of fixes respect rate limits
- Alert noise <2 false positives/week
- Projected annual cost <$10/year

---

## File Structure

**New Files** (~2,700 lines total):

```
shared/
├── budget/
│   ├── store.ts              (~300 lines) - Budget state management
│   ├── adapters.ts           (~200 lines) - GitHub/File state adapters
│   └── types.ts              (~80 lines)  - Interfaces
├── rate-limit/
│   ├── limiter.ts            (~200 lines) - Rate limiting logic
│   └── types.ts              (~50 lines)  - Interfaces
├── cost/
│   ├── estimator.ts          (~200 lines) - Pre-flight estimation
│   └── types.ts              (~40 lines)  - Interfaces
└── alerts/
    ├── notifier.ts           (~250 lines) - Alert system
    └── types.ts              (~60 lines)  - Interfaces

scripts/
├── cost-dashboard.ts         (~280 lines) - CLI dashboard
├── budget-status.ts          (~100 lines) - Budget report
├── reset-budget.ts           (~80 lines)  - Reset utility
└── sweep-reservations.ts     (~120 lines) - Sweeper (hourly cron)

tests/
├── budget-store.test.ts      (~250 lines) - Budget unit tests
├── rate-limiter.test.ts      (~150 lines) - Rate limit tests
├── cost-estimator.test.ts    (~150 lines) - Estimation tests
├── alert-notifier.test.ts    (~100 lines) - Alert tests
├── e2e.test.ts               (~200 lines) - E2E scenarios
├── property.test.ts          (~100 lines) - Property tests
└── chaos.test.ts             (~80 lines)  - Chaos engineering

docs/
├── RUNBOOKS.md               (~500 lines) - Operational guides
├── SECURITY-REVIEW.md        (~300 lines) - Security analysis
└── API-MANAGEMENT-PLAN.md    (this file)
```

**Modified Files**:

```
shared/cost/tracker.ts        (+40 lines) - Budget integration
homeostat/orchestrator.ts     (+60 lines) - Reserve-commit flow
package.json                  (+8 lines)  - New npm scripts
.github/workflows/
  multi-repo-orchestrator.yml (+30 lines) - Budget env vars
  sweep-reservations.yml      (new, 40 lines) - Hourly sweeper
```

**State Repository** (`littlebearapps/homeostat-state`):

```
.homeostat/
├── budgets/index.json        (auto-generated)
├── reservations/
│   ├── 2025-10-28.json       (auto-generated)
│   └── 2025-10-29.json       (auto-generated)
└── audit/
    ├── 2025-10.ndjson        (append-only)
    └── 2025-11.ndjson        (append-only)
```

---

## Configuration

### Environment Variables

**GitHub Actions** (`.github/workflows/multi-repo-orchestrator.yml`):

```yaml
env:
  # Budget configuration
  DAILY_BUDGET_LIMIT: "0.25"
  WEEKLY_BUDGET_LIMIT: "1.00"
  MONTHLY_BUDGET_LIMIT: "3.00"

  # Per-repo allocation (80% of daily)
  PER_REPO_DAILY_LIMIT: "0.066"
  POOL_DAILY_LIMIT: "0.05"

  # Rate limits
  GLOBAL_RATE_LIMIT_24H: "50"
  PER_REPO_RATE_LIMIT_24H: "20"
  GLOBAL_RATE_LIMIT_1MIN: "10"
  PER_REPO_RATE_LIMIT_1MIN: "5"

  # Alert configuration
  SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  ALERT_REPO: "littlebearapps/homeostat"

  # State repository
  STATE_REPO: "littlebearapps/homeostat-state"
  STATE_REPO_TOKEN: ${{ secrets.HOMEOSTAT_STATE_PAT }}

  # Fail mode
  FAIL_MODE: "closed"  # closed | open
```

### GitHub Secrets

**Required**:
- `SLACK_WEBHOOK_URL` - Slack incoming webhook for alerts
- `HOMEOSTAT_STATE_PAT` - Personal Access Token with `repo` scope for state repository

**Setup**:
```bash
# Add Slack webhook
gh secret set SLACK_WEBHOOK_URL --repo littlebearapps/homeostat

# Create PAT for state repo (via GitHub UI: Settings → Developer settings → PATs)
# Then add to GitHub Secrets:
gh secret set HOMEOSTAT_STATE_PAT --repo littlebearapps/homeostat
```

---

## Testing Strategy

### Unit Tests (~850 lines, 40+ tests)

**Budget Store**:
- ✅ Reserve creates reservation with TTL
- ✅ Commit replaces reservation with actual spend
- ✅ Release removes reservation
- ✅ Concurrent reservations handled (optimistic locking)
- ✅ Budget never goes negative
- ✅ Daily/weekly/monthly resets work correctly
- ✅ Per-repo allocation enforced

**Rate Limiter**:
- ✅ Sliding window pruning (24h)
- ✅ Bucket window pruning (1min)
- ✅ Global and per-repo limits enforced
- ✅ No false positives after window expiry

**Cost Estimator**:
- ✅ Tier probabilities calculated from history
- ✅ Confidence scoring accurate
- ✅ Estimation within bounds

**Alert Notifier**:
- ✅ Thresholds detected (50%/75%/90%/100%)
- ✅ Deduplication prevents spam
- ✅ Slack + GitHub integrations work

### Integration Tests (~200 lines, 10+ tests)

**Orchestrator → Budget → Rate Limit**:
- ✅ Happy path: Reserve → Process → Commit
- ✅ Budget exceeded: Reserve fails → Block processing
- ✅ Rate limit exceeded: canProceed fails → Block processing
- ✅ Concurrent issues: Multiple reservations honored
- ✅ Alert triggering at thresholds

### E2E Tests (~200 lines, 5+ scenarios)

**Scenarios**:
1. ✅ Single issue → estimate → reserve → fix → commit
2. ✅ Budget exceeded → reserve fails → comment on issue
3. ✅ Rate limit hit → canProceed fails → comment on issue
4. ✅ Job cancellation → reservation expires → swept
5. ✅ Error storm (10 concurrent) → rate limit stops burst

### Property Tests (~100 lines, 5+ properties)

**Invariants**:
- ✅ `actual_spend + outstanding_reservations ≤ cap` (always)
- ✅ Rate limit counts never exceed window size
- ✅ Alerts never duplicate within cooldown
- ✅ Reservations always have TTL
- ✅ Audit log is append-only (no deletions)

### Chaos Tests (~80 lines, 5+ scenarios)

**Failure Injection**:
- ✅ GitHub API 409 (conflict) → Retry succeeds
- ✅ GitHub API 500 (server error) → Fail-closed
- ✅ Network timeout → Idempotent retry
- ✅ Clock skew → Budget reset still works
- ✅ Corrupted state file → Initialize defaults

---

## Operational Runbooks

### Daily Operations

**Check Budget Status**:
```bash
npm run budget:status
# Or:
npm run dashboard
```

**Expected Output**:
```
📊 Budget Status (2025-10-28)
Daily:   $0.12 / $0.25 (48.0%)
Weekly:  $0.45 / $1.00 (45.0%)
Monthly: $0.89 / $3.00 (29.7%)

✅ All within limits
```

### Weekly Operations

**Review Trends**:
```bash
npm run dashboard --period week
```

**Check Alert History**:
```bash
gh issue list --label cost-alert --repo littlebearapps/homeostat
```

### Incident Response

#### Budget Exceeded

**Symptom**: Alert "🚨 BUDGET EXCEEDED" in Slack

**Investigation**:
```bash
# 1. Check current status
npm run dashboard

# 2. Review audit log (last 100 entries)
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/littlebearapps/homeostat-state/main/.homeostat/audit/$(date +%Y-%m).ndjson \
  | tail -100 | jq 'select(.type == "reserve" or .type == "commit")'

# 3. Identify high-cost fixes
cat .homeostat/audit/2025-10.ndjson | jq 'select(.amount > 0.01)'
```

**Resolution**:
- If legitimate (error storm): Wait for daily reset at 00:00 UTC
- If unexpected: Investigate issue causing high costs, adjust tier thresholds
- If critical: Break-glass override (add `override:budget` label to issue)

#### Rate Limit Hit

**Symptom**: Alert "⏸️ Rate limit exceeded" in issue comments

**Investigation**:
```bash
# Check recent issues
gh issue list --label robot --state all --created ">=$(date -v-1d +%Y-%m-%d)"

# Check for duplicate errors (same fingerprint)
cat logs/homeostat.jsonl | jq 'select(.event == "issue_processed")' | jq -r '.fingerprint' | sort | uniq -c | sort -rn
```

**Resolution**:
- If duplicate errors: Fix underlying issue causing repeated errors
- If legitimate storm: Wait for 24h window to expire
- Adjust rate limits if too conservative

#### Reservation Sweeper Not Running

**Symptom**: Outstanding reservations not expiring

**Investigation**:
```bash
# Check sweeper workflow runs
gh run list --workflow sweep-reservations.yml --repo littlebearapps/homeostat

# Check stale reservations
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/littlebearapps/homeostat-state/main/.homeostat/reservations/$(date +%Y-%m-%d).json \
  | jq 'map(select(.state == "reserved" and .expires_at < now))'
```

**Resolution**:
- Manually trigger sweeper: `gh workflow run sweep-reservations.yml`
- Or manually release stale reservations via API

### Emergency Overrides

**Break-glass: Bypass Budget**

```bash
# Add override label to issue
gh issue edit <issue_number> --add-label override:budget --repo littlebearapps/convert-my-file

# Workflow will detect label and skip budget checks
# Alert will be sent to Slack + GitHub for every override use
```

**⚠️ Use sparingly**: Overrides are logged in audit trail and trigger emergency alerts.

---

## Cost Projections

### Before API Management

| Metric | Value |
|--------|-------|
| **Current Projection** | $5.77-$6.99/year |
| **Per-fix Average** | $0.0058 (with retries) |
| **Theoretical Max** | $1,460/year (unlimited errors) |
| **Risk Multiplier** | 243× |

### After API Management

| Metric | Value |
|--------|-------|
| **Hard Cap** | $36/year (monthly $3 × 12) |
| **Soft Target** | $9.28/year (daily $0.25 × 37 days usage) |
| **Risk Reduction** | 97.5% (from $1,460 → $36) |
| **Operational Overhead** | ~2 hours/month monitoring |

### Budget Breakdown

**Daily Budget** ($0.25):
- Convert My File: $0.066 (26.4%)
- NoteBridge: $0.066 (26.4%)
- Palette Kit: $0.066 (26.4%)
- Shared Pool: $0.052 (20.8%)

**Rationale**:
- 80% allocated equally across 3 repos
- 20% pooled for flexibility (spikes, new repos)
- 15× current daily spend ($0.016/day → $0.25/day)

**Annual Projections**:
- Conservative (10% usage): $3.65/year
- Moderate (25% usage): $9.13/year
- High (50% usage): $18.25/year
- Absolute Max: $36/year

---

## Success Metrics

### Week 1 (Foundation)

- [ ] Budget tracking active for all 3 repos
- [ ] Rate limiting active (no false positives)
- [ ] Zero budget overruns
- [ ] Concurrent reservations handled without conflicts (<5% retry rate)
- [ ] State synchronization latency <2 seconds (p95)

### Week 2 (Intelligence)

- [ ] Cost estimation within 20% of actual for 80%+ of issues
- [ ] Alerts trigger at correct thresholds (50%/75%/90%/100%)
- [ ] Zero missed "budget exceeded" alerts
- [ ] Alert noise <2 false positives per week

### Week 3 (Observability)

- [ ] Dashboard used daily for monitoring
- [ ] Budget status accessible in <5 seconds
- [ ] Historical trends visible (7-day, 30-day)
- [ ] Audit log complete and queryable

### Week 4 (Validation)

- [ ] 100% of fixes respect budget limits
- [ ] 100% of fixes respect rate limits
- [ ] Projected annual cost <$10/year
- [ ] E2E tests passing (5/5 scenarios)
- [ ] Property tests passing (5/5 invariants)
- [ ] Chaos tests passing (5/5 failure scenarios)

---

## Risks and Mitigations

### Technical Risks

**Risk: GitHub API Rate Limits**
- **Impact**: State updates fail if GitHub API rate limited
- **Probability**: Low (60 requests/hour free tier = 1,440/day)
- **Mitigation**:
  - Monitor API usage via `X-RateLimit-Remaining` header
  - Implement exponential backoff + retry
  - Alert at 80% of rate limit

**Risk: Concurrent Write Conflicts**
- **Impact**: Multiple workflows retry frequently, increasing latency
- **Probability**: Medium (3 repos × 4 runs/day = 12 potential conflicts/day)
- **Mitigation**:
  - Optimistic locking with SHA precondition
  - Exponential backoff + jitter (max 10s)
  - Monitor retry rate (alert if >10%)

**Risk: Clock Skew**
- **Impact**: Budget resets at wrong time, TTL calculations incorrect
- **Probability**: Low (GitHub Actions uses UTC)
- **Mitigation**:
  - Always use UTC timestamps
  - Fixed 00:00 UTC daily reset (not sliding 24h)
  - TTL validation on reservation creation

**Risk: State Repository Corruption**
- **Impact**: Budget tracking fails, workflows blocked
- **Probability**: Very Low (GitHub's durability)
- **Mitigation**:
  - Validate JSON schema on every load
  - Initialize defaults if validation fails
  - Daily backups of state repository
  - Audit log for reconstruction

### Operational Risks

**Risk: Alert Fatigue**
- **Impact**: Important alerts ignored due to noise
- **Probability**: Medium (if thresholds too sensitive)
- **Mitigation**:
  - Deduplication (one alert per period per threshold)
  - Cooldown periods (no repeat within 1 hour)
  - Progressive severity (info → warning → critical)
  - Monitor alert volume (target <2/week)

**Risk: Budget Too Conservative**
- **Impact**: Legitimate fixes blocked, user frustration
- **Probability**: Low (15× buffer over current spend)
- **Mitigation**:
  - Monitor "budget blocked" rate (alert if >5%)
  - Weekly review of blocked fixes
  - Adjust limits based on actual usage (tuning in Week 4)

**Risk: Sweeper Not Running**
- **Impact**: Stale reservations accumulate, budget inflated
- **Probability**: Low (GitHub Actions cron is reliable)
- **Mitigation**:
  - Hourly sweeper cron job
  - Monitor stale reservation count (alert if >10)
  - Manual sweep utility (`npm run sweep`)

### Security Risks

**Risk: State Repository Token Leakage**
- **Impact**: Unauthorized budget modifications
- **Probability**: Very Low (secrets encrypted in GitHub)
- **Mitigation**:
  - Use GitHub App instead of PAT (recommended)
  - Scope PAT to single repo (`homeostat-state` only)
  - Rotate PAT quarterly
  - Audit log tracks all modifications

**Risk: Break-glass Override Abuse**
- **Impact**: Budget caps bypassed frequently
- **Probability**: Low (manual override, logged)
- **Mitigation**:
  - Require `override:budget` label (manual action)
  - Emergency alert for every override use
  - Weekly review of override count (target 0)
  - Rate limit overrides (max 5/week)

---

## Next Steps

### 1. Review and Approval

**Questions for Discussion**:
1. Budget targets: Are $0.25/day, $1/week, $3/month appropriate? (Currently 15× buffer)
2. Rate limits: Are 50 global, 20 per-repo (24h) reasonable? Should burst limits be stricter?
3. Fail mode: Agree on fail-closed by default? Override mechanism acceptable?
4. State repository: Create `littlebearapps/homeostat-state` (private) or different name?
5. Alert channels: Slack only, or add email/PagerDuty?
6. Timeline: 4-week phased rollout acceptable, or should we prioritize differently?

### 2. Pre-implementation Setup

**Infrastructure**:
- [ ] Create `littlebearapps/homeostat-state` repository (private)
- [ ] Generate GitHub App or PAT for state repository access
- [ ] Add `HOMEOSTAT_STATE_PAT` to GitHub Secrets
- [ ] Configure Slack webhook for alerts
- [ ] Add `SLACK_WEBHOOK_URL` to GitHub Secrets

### 3. Phase 1 Kickoff

**After Approval**:
- [ ] Create feature branch: `feature/api-management`
- [ ] Implement GitHub state adapter with optimistic locking
- [ ] Implement budget store with reserve-commit lifecycle
- [ ] Implement rate limiter with dual windows
- [ ] Write unit tests (target: >95% coverage)
- [ ] Integration testing with synthetic issues
- [ ] PR #1: Foundation (budget + rate limit)

### 4. Incremental Delivery

**PR Strategy**:
- PR #1: Foundation (budget store + rate limiter + tests)
- PR #2: Intelligence (cost estimator + alerts + tests)
- PR #3: Observability (dashboard + utilities + docs)
- PR #4: Validation (E2E tests + chaos tests + security review)

**Rationale**: Small, reviewable PRs reduce risk and enable faster feedback loops.

---

## Appendix

### A. Budget Allocation Formula

**Global Daily Budget**: `G = $0.25`

**Per-repo Allocation** (80% of global, divided equally):
```
allocated = G × 0.80
per_repo = allocated / num_repos
pool = G × 0.20
```

**Example** (3 repos):
```
allocated = $0.25 × 0.80 = $0.20
per_repo = $0.20 / 3 = $0.0667 ≈ $0.066
pool = $0.25 × 0.20 = $0.05
```

**Invariant**: `sum(per_repo) + pool ≤ G`

**Validation**:
```
3 × $0.066 + $0.05 = $0.248 ≤ $0.25 ✅
```

### B. Reserve-Commit State Machine

```
┌─────────┐
│ IDLE    │
└────┬────┘
     │ reserve()
     ▼
┌─────────┐  commit()   ┌───────────┐
│RESERVED ├────────────►│ COMMITTED │
└────┬────┘             └───────────┘
     │
     │ release() OR expire (TTL)
     ▼
┌─────────┐
│RELEASED │
└─────────┘
```

**State Transitions**:
- `IDLE → RESERVED`: `reserve()` creates reservation
- `RESERVED → COMMITTED`: `commit()` replaces reservation with actual spend
- `RESERVED → RELEASED`: `release()` or TTL expiry removes reservation

**Invariants**:
- `RESERVED` must have `expires_at` timestamp
- `COMMITTED` cannot be uncommitted
- `RELEASED` cannot be re-reserved (use new reservation)

### C. Optimistic Locking Example

**Scenario**: Two workflows update budget simultaneously

**Workflow A**:
```typescript
// 1. Fetch state (SHA: abc123)
const { data, sha } = await getContent('budgets/index.json');
const state = JSON.parse(data);

// 2. Update state
state.daily.spent += 0.02;

// 3. Commit with SHA precondition
await updateContent('budgets/index.json', state, sha); // ✅ Success (SHA matches)
```

**Workflow B** (concurrent):
```typescript
// 1. Fetch state (SHA: abc123, same as A)
const { data, sha } = await getContent('budgets/index.json');
const state = JSON.parse(data);

// 2. Update state
state.daily.spent += 0.015;

// 3. Commit with SHA precondition
await updateContent('budgets/index.json', state, sha); // ❌ 409 Conflict (SHA changed by A)

// 4. Retry with backoff
await sleep(randomJitter(1000, 2000));
goto step 1; // Refetch with new SHA
```

**Result**: Both updates eventually succeed, budget accurate.

### D. Sweeper Algorithm

**Hourly Cron** (`.github/workflows/sweep-reservations.yml`):

```typescript
async function sweepStaleReservations(): Promise<SweepResult> {
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // 1. Load today's reservations
  const { data, sha } = await getContent(`reservations/${today}.json`);
  const reservations = JSON.parse(data);

  // 2. Find stale reservations (expired + still in "reserved" state)
  const stale = reservations.filter(r =>
    r.state === 'reserved' &&
    new Date(r.expires_at) < now
  );

  if (stale.length === 0) {
    return { swept: 0 };
  }

  // 3. Mark as expired
  stale.forEach(r => r.state = 'expired');

  // 4. Update reservations file
  await updateContent(`reservations/${today}.json`, reservations, sha);

  // 5. Release budget
  for (const r of stale) {
    await budgetStore.release(r.id);
  }

  logger.info('Swept stale reservations', { count: stale.length });
  return { swept: stale.length };
}
```

**Frequency**: Hourly (compromise between cost and responsiveness)

**Why Needed**: Handles job cancellations, crashes, network failures where `commit()` never called.

### E. Alert Deduplication

**Algorithm**:

```typescript
interface AlertKey {
  period_id: string;    // e.g., "2025-10-28"
  threshold: string;    // e.g., "75%"
  scope: string;        // e.g., "global" or "convert-my-file"
}

class AlertNotifier {
  private alerted: Map<string, Date> = new Map();

  private shouldAlert(key: AlertKey): boolean {
    const keyStr = `${key.period_id}:${key.threshold}:${key.scope}`;
    const lastAlert = this.alerted.get(keyStr);

    if (!lastAlert) {
      this.alerted.set(keyStr, new Date());
      return true; // Never alerted before
    }

    const cooldownHours = 1;
    const elapsed = (Date.now() - lastAlert.getTime()) / 1000 / 60 / 60;

    if (elapsed > cooldownHours) {
      this.alerted.set(keyStr, new Date());
      return true; // Cooldown expired
    }

    return false; // Within cooldown, skip
  }
}
```

**Result**: Max 1 alert per (period, threshold, scope) per hour.

---

## Conclusion

This plan provides a comprehensive, production-ready API cost management system for Homeostat. Key features:

**Cost Control**:
- 97.5% risk reduction (from $1,460 → $36 theoretical max)
- Pre-flight estimation prevents waste
- Reserve-commit semantics prevent overspend races

**Reliability**:
- GitHub-backed state (no external services)
- Optimistic locking (handles concurrency)
- Fail-closed by default (with break-glass override)

**Observability**:
- Real-time dashboard
- Multi-level alerts (50%/75%/90%/100%)
- Append-only audit trail

**Operational Simplicity**:
- File-based storage (no database)
- ~2 hours/month monitoring overhead
- Self-service utilities (dashboard, reset, sweep)

**Testing**:
- 40+ unit tests, 10+ integration tests, 5+ E2E scenarios
- Property tests for invariants
- Chaos tests for resilience

**Timeline**: 4 weeks, 44-60 hours

**Next**: Review plan, discuss questions, approve for implementation.
