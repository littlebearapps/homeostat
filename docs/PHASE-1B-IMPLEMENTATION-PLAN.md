# Phase 1B Implementation Plan: Alerting & Reporting

**Status**: Deferred (Recommended)
**Created**: 2025-10-29
**Analysis**: GPT-5 Deep Think (5 steps, very high confidence)
**Estimated Effort**: 3-4 hours (full) or 1 hour (minimal)

---

## Executive Summary

Phase 1B adds proactive alerting and reporting to Homeostat's budget and rate limiting system (Phase 1A). After comprehensive analysis, **we recommend deferring Phase 1B until after 30 days of production usage** for the following reasons:

1. **Budget caps already prevent overspend** - Alerts are nice-to-have, not critical
2. **Real usage data will inform better thresholds** - Current 75%/90%/100% are theoretical
3. **Focus on core fix pipeline first** - Validate the primary value proposition
4. **Low urgency** - Hard caps protect us; alerts provide observability

**Alternative**: Implement **minimal Phase 1B** (1 hour) with only 100% enforcement alerts if immediate visibility is needed.

---

## Key Findings from GPT-5 Analysis

### State Persistence Gap

**CRITICAL**: The original plan to "remove GitHub Contents API integration" creates a problem - **file-based state without write-back won't persist between GitHub Actions runs**.

**Solution** (from GPT-5 expert analysis):
- Commit state files to repo after each update (`.homeostat/state/budget.json`, `rate_limiter.json`)
- Use dedicated state path to minimize diff noise
- Alternative: GitHub Actions cache (simpler but less auditable)
- **Recommendation**: Commit-based persistence (already implemented in Phase 1A)

### Concurrency & Race Conditions

**Issue**: Parallel workflows can double-spend unless serialized.

**Solution**:
```yaml
# .github/workflows/multi-repo-orchestrator.yml
concurrency:
  group: homeostat-budget-${{ github.repository }}
  cancel-in-progress: false  # Queue, don't cancel
```

This serializes budget-modifying runs per repo, eliminating need for optimistic locking.

### Time Boundaries

**Issue**: Mixed sliding and calendar windows need explicit rules.

**Solution**:
- Normalize to UTC for all windows
- Store `last_rollover_utc_date` in budget state
- Roll forward on first write after day/week/month boundary
- Rate limiting: Store ISO timestamps, prune >24h
- Budgets: Use calendar windows (UTC) as implemented

---

## Architecture

### Hybrid Integration Approach

**Workflow-Level** (Immediate):
- 100% threshold → GitHub Issue (blocking alert)
- Triggered on every orchestrator run
- No additional infrastructure required

**Scheduled Digest** (Daily):
- 75%/90% thresholds → Markdown report (`.homeostat/reports/YYYY-MM-DD.md`)
- Run at 23:00 UTC (before midnight reset)
- Committed to repo for visibility
- Includes actionable recommendations

**Weekly Report** (Comprehensive):
- Aggregate JSONL artifacts
- Tier distribution analysis
- Cost trajectory and efficiency metrics
- Recommendations for optimization

### Alert Delivery Mechanisms

| Threshold | Delivery | Timing | Purpose |
|-----------|----------|--------|---------|
| 100% | GitHub Issue | Immediate | Enforcement (blocks workflow) |
| 90% | Daily Digest | 23:00 UTC | Critical warning |
| 75% | Daily Digest | 23:00 UTC | Early warning |
| Weekly | Report File | Sunday 23:00 UTC | Trend analysis |

### State Management

```typescript
// .homeostat/state/alerts.json (git-tracked, per-repo)
interface AlertState {
  lastDigestAt: string;           // ISO timestamp of last daily digest
  lastAlerts: {
    [period: string]: {           // 'daily', 'weekly', 'monthly', 'perMinute', 'perDay'
      threshold: number;          // 75, 90, 100
      alertedAt: string;          // ISO timestamp
    }
  };
  suppressions: {
    [alertKey: string]: {         // e.g., 'budget:daily:100'
      until: string;              // De-dup window
    }
  };
}
```

### De-duplication Strategy

- **100% alerts**: 1-hour suppression (prevent spam on repeated failures)
- **75%/90% alerts**: Suppress until period reset (alert once per threshold crossing)
- **Daily digest**: Run once at 23:00 UTC
- **Global suppression**: Max 1 issue per alert type per hour (across all repos)

---

## Implementation Plan (Full Phase 1B)

### Phase 1: Core Alert Logic (1.5 hours)

**Files**:
```
shared/
  alerts/
    alert-manager.ts       # Core alert logic (150 lines)
    alert-state.ts         # State management (100 lines)
    types.ts               # Alert interfaces (50 lines)
```

**Key Functions**:
```typescript
// alert-manager.ts
export class AlertManager {
  async checkBudgetAlerts(state: BudgetState): Promise<Alert[]>
  async checkRateLimitAlerts(state: RateLimiterState): Promise<Alert[]>
  async shouldAlert(alert: Alert): Promise<boolean>  // De-duplication
  async recordAlert(alert: Alert): Promise<void>
}
```

**Tests**: `tests/unit/alerts/alert-manager.test.ts` (150 lines)
- De-duplication logic
- Threshold crossing detection
- Suppression window enforcement
- Alert state persistence

### Phase 2: Alert Delivery (1 hour)

**Files**:
```
shared/
  alerts/
    github-alerter.ts      # Issue creation (100 lines)
    digest-generator.ts    # Markdown templating (200 lines)
```

**Key Functions**:
```typescript
// github-alerter.ts
export class GitHubAlerter {
  async createBudgetIssue(alert: Alert, repo: string): Promise<void>
  async createRateLimitIssue(alert: Alert, repo: string): Promise<void>
}

// digest-generator.ts
export class DigestGenerator {
  generateDailyDigest(budgetState, rateLimitState, alerts): string
  generateWeeklyReport(jsonlArtifacts): string
  private formatBudgetSummary(state): string
  private formatTierDistribution(artifacts): string
}
```

**Tests**: `tests/unit/alerts/digest-generator.test.ts` (100 lines)
- Markdown formatting
- Metric calculations
- Template rendering

### Phase 3: Workflow Integration (0.5 hours)

**Files**:
```
.github/
  workflows/
    daily-digest.yml       # Scheduled digest (50 lines)
    weekly-report.yml      # Weekly aggregation (50 lines)
```

**Changes to multi-repo-orchestrator.yml** (~30 lines):
```yaml
# After budget/rate limit checks
- name: Check for alerts
  run: |
    node scripts/check-alerts.js
    if [ $? -eq 100 ]; then
      echo "Budget exhausted - creating enforcement issue"
      node scripts/create-enforcement-issue.js
      exit 1
    fi
```

**Daily Digest Workflow**:
```yaml
name: Daily Budget Digest
on:
  schedule:
    - cron: '0 23 * * *'  # 23:00 UTC daily
  workflow_dispatch:      # Manual trigger

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate digest
        run: npm run alerts:digest
      - name: Commit digest
        run: |
          git config user.name "homeostat-bot"
          git config user.email "bot@littlebearapps.com"
          git add .homeostat/reports/
          git commit -m "chore: daily budget digest $(date -u +%Y-%m-%d)"
          git push
```

### Phase 4: Testing & Documentation (1 hour)

**Integration Tests**: `tests/integration/alerts.test.ts` (50 lines)
- End-to-end alert flow (threshold → issue creation)
- Scheduled workflow simulation
- De-duplication across runs

**Documentation Updates**:
- Add alerting section to README.md
- Document alert thresholds and de-duplication
- Add troubleshooting guide for missed alerts

**New Scripts**:
```bash
npm run alerts:status   # Show current alert state
npm run alerts:test     # Simulate alert scenarios
npm run alerts:digest   # Generate daily digest (manual)
```

---

## Implementation Plan (Minimal Phase 1B)

**Scope**: Only 100% enforcement alerts (1 hour)

**Changes**:
1. Add `shared/alerts/enforcement-alerter.ts` (50 lines)
2. Update orchestrator to check 100% threshold and create issue
3. Add 20 unit tests for enforcement logic
4. Update README with alert behavior

**No scheduled workflows, no digests, no weekly reports**. Just immediate blocking alerts when budget is exhausted.

---

## Alert Message Templates

### 100% Budget Alert (GitHub Issue)

```markdown
## 🚨 Budget Exhausted: Daily Cap Reached

**Period**: Daily
**Spent**: $0.0660 / $0.0660 (100%)
**Time**: 2025-10-29 14:32 UTC

### Impact
All Homeostat workflows are paused until the daily budget resets at 00:00 UTC.

### Action Required
- ✅ **Wait**: Budget resets in 9h 28m
- ⚠️ **Override**: Manually increase daily cap in `homeostat/config.ts` (not recommended)
- 📊 **Analyze**: Check tier distribution for optimization opportunities

### Next Steps
1. Review `.homeostat/reports/` for daily digest
2. Run `npm run budget:status` to see full breakdown
3. Consider deferring non-critical fixes until tomorrow

---
*Auto-generated by Homeostat | Suppressed for 1 hour*
```

**Issue Labels**: `homeostat:alert`, `budget:daily`, `auto-created`

### Daily Digest (Markdown File)

```markdown
# Homeostat Daily Digest - 2025-10-29

## Budget Status
- **Daily**: $0.0587 / $0.0660 (88.9%) ⚠️
- **Weekly**: $0.1423 / $0.462 (30.8%) ✅
- **Monthly**: $0.5234 / $1.98 (26.4%) ✅

## Rate Limiting
- **Per-Minute**: Peak 4/5 (80%) ⚠️
- **Per-Day**: 18/20 (90%) ⚠️

## Alerts
- ⚠️ Daily budget at 90% threshold (triggered at 14:32 UTC)
- ⚠️ Per-day rate limit at 90% threshold (18/20 attempts)

## Recommendations
- Daily budget on track to exhaust by ~16:00 UTC
- Consider deferring non-critical fixes until tomorrow's reset
- Per-day rate limit may block evening fixes (2 attempts remaining)
```

### Weekly Report (Comprehensive)

```markdown
# Homeostat Weekly Report (2025-10-22 to 2025-10-29)

## Executive Summary
- **Total Spent**: $0.4235 (91.7% of weekly cap) ⚠️
- **Attempts**: 87 (DeepSeek: 64, GPT-4.5: 19, GPT-5: 4)
- **Efficiency**: 89.3% (reserved $0.474, actual $0.4235)
- **Success Rate**: 73.6% (64/87 fixes merged)

## Budget Analysis
| Period | Spent | Cap | Usage | Trend |
|--------|-------|-----|-------|-------|
| Daily | $0.0587 avg | $0.066 | 88.9% | ⚠️ High |
| Weekly | $0.4235 | $0.462 | 91.7% | ⚠️ Near cap |
| Monthly | $1.823 | $1.98 | 92.1% | ⚠️ Near cap |

## Tier Distribution
- **Tier 1 (DeepSeek)**: 73.6% (64/87) - $0.0256 total (avg $0.0004/fix)
- **Tier 2 (GPT-4.5)**: 21.8% (19/87) - $0.0342 total (avg $0.0018/fix)
- **Tier 3 (GPT-5)**: 4.6% (4/87) - $0.0268 total (avg $0.0067/fix)

✅ Tier distribution optimal (target: 60-80% Tier 1)

## Rate Limiting
- **Per-Minute Window**: Peak 5/5 (100%) - 0 rejections
- **Per-Day Window**: Peak 19/20 (95%) - 0 rejections
- **Busiest Hour**: 14:00-15:00 UTC (23 attempts)

✅ No rate limit rejections this week

## Cost Trajectory
- **Current weekly burn**: $0.4235
- **Projected monthly**: $1.823 (92.1% of $1.98 cap)
- **Annual projection**: $22.02 (137.6% over $16/year target)

⚠️ **Action Required**: Monthly budget likely to exhaust. Consider:
1. Increase Tier 1 threshold (DeepSeek handles more complexity)
2. Defer non-critical fixes to next month
3. Review tier selection logic for over-escalation

## Top Error Types Fixed
1. `TypeError`: 34 fixes (39.1%)
2. `ReferenceError`: 18 fixes (20.7%)
3. `UnhandledPromiseRejection`: 12 fixes (13.8%)
4. Other: 23 fixes (26.4%)

## Recommendations
1. ✅ Tier distribution is healthy - no changes needed
2. ⚠️ Weekly budget usage is high - monitor daily caps
3. ⚠️ Consider increasing per-day rate limit to 25 (currently peaking at 95%)
4. 📊 Review Tier 2/3 escalations for potential Tier 1 candidates

---
*Generated: 2025-10-29 23:00 UTC | Next report: 2025-11-05*
```

---

## Edge Cases & Mitigations

### 1. Alert Storm Scenario
**Problem**: Multiple repos hit 100% simultaneously → flood of issues

**Mitigation**: Global suppression window (1 issue per alert type per hour across all repos)

**Implementation**: Shared suppression state in `.homeostat/state/global-alerts.json`

### 2. Clock Skew at Period Boundaries
**Problem**: Daily digest runs at 23:00 UTC, period resets at 00:00 UTC → potential race

**Mitigation**:
- Digest captures state snapshot before reset
- Alert state tracks `lastDigestAt` to prevent duplicates

### 3. GitHub Actions Quota Exhaustion
**Problem**: Scheduled workflow can't run if Actions quota exceeded

**Mitigation**:
- Fallback to workflow-level alerts (always run on issue triggers)
- Document: Alert gaps expected if Actions quota exhausted

### 4. Concurrent Workflow Runs
**Problem**: Scheduled digest + issue trigger run simultaneously → duplicate alerts

**Mitigation**:
- Use workflow concurrency groups (already in orchestrator)
- Alert state de-duplication as second defense layer

### 5. Alert State Corruption
**Problem**: Git conflict on alerts.json if two PRs modify simultaneously

**Mitigation**:
- Read-merge-write pattern with retry (similar to circuit breaker)
- Fallback: Regenerate alert state from budget/rate limit state if corrupted

---

## Known Limitations

### 1. Historical Data
- **Limitation**: No historical metrics beyond current period
- **Impact**: Weekly digest can't show week-over-week trends
- **Workaround**: Parse JSONL artifacts for historical data (optional enhancement)
- **Decision**: Accept for Phase 1B (simplicity > sophistication)

### 2. Alert Delivery Reliability
- **Limitation**: Best-effort delivery (may fail if GITHUB_TOKEN revoked or webhook down)
- **Mitigation**: Graceful degradation (log error, continue workflow)
- **Decision**: Alerts are observability, not critical path

### 3. Cross-Repo Aggregation
- **Limitation**: Per-repo state, no central aggregation
- **Impact**: Can't answer "What's total spend across all extensions?"
- **Workaround**: Manual aggregation from state files
- **Decision**: Out of scope for Phase 1B

### 4. Alert Customization
- **Limitation**: Fixed thresholds (75%/90%/100%), fixed schedule (23:00 UTC)
- **Impact**: Can't adjust per-repo (e.g., higher threshold for low-traffic repos)
- **Decision**: YAGNI - wait for real need

### 5. Alert Actionability
- **Challenge**: "Daily budget at 90%" → what should developer do?
- **Solution**: Include actionable steps in alert message
- **Example**: "Consider deferring non-critical fixes until tomorrow's reset"

---

## Success Metrics

1. **Alert Accuracy**: Zero false positives (100% threshold fires only when truly exhausted)
2. **Delivery Reliability**: Daily digest delivered 95%+ of days
3. **Actionability**: Weekly report leads to 1+ optimization per month
4. **Response Time**: Developer sees 100% alert within 1 hour
5. **Code Quality**: 90%+ test coverage on alert logic

---

## Validation Plan

### Week 1: Alert Frequency
- Monitor: How often do alerts fire?
- Target: 0-2 issues/week per repo under normal operation
- Action: If >5 issues/week, tune thresholds

### Week 2: False Warnings
- Monitor: Do 75%/90% alerts correlate with actual exhaustion?
- Target: >80% of warnings followed by 100% within 24h
- Action: Adjust thresholds if false positive rate >20%

### Week 4: Report Value
- Monitor: Do weekly report recommendations lead to action?
- Target: 1+ optimization implemented based on insights
- Action: If no value, consider removing weekly reports

### Month 3: Keep or Remove
- Decision point: Is Phase 1B worth maintaining?
- Keep if: Actionable insights, prevented 1+ incident, used regularly
- Remove if: Unused, no incidents prevented, adds maintenance burden

---

## Trade-offs Analysis

### Simplicity vs Sophistication
**Chose**: Git-tracked state files over database
**Gain**: Zero infrastructure, atomic commits, audit trail
**Lose**: No queryability, manual aggregation
**Rationale**: Small scale (3 repos) doesn't justify DB complexity

### Timeliness vs Resource Usage
**Chose**: Daily digest (23:00 UTC) vs real-time monitoring
**Gain**: Batched alerts, lower GitHub Actions usage
**Lose**: Delayed awareness of 75%/90% thresholds
**Rationale**: Budget caps enforce limits; alerts are for awareness

### Coverage vs Noise
**Chose**: Only 100% creates issues, 75%/90% in digest
**Gain**: High signal-to-noise ratio, actionable alerts
**Lose**: Developers may miss early warnings
**Rationale**: Alert fatigue worse than delayed visibility

### Flexibility vs Maintenance
**Chose**: Fixed thresholds/schedules vs configurable
**Gain**: Simpler code, fewer edge cases
**Lose**: Can't customize per-repo
**Rationale**: YAGNI - add configurability when proven need

---

## Configuration

### Environment Variables

```bash
# Optional Slack webhook for real-time notifications
HOMEOSTAT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Alert suppression window (hours)
HOMEOSTAT_ALERT_SUPPRESSION_HOURS=1  # Default: 1

# Digest schedule (UTC hour)
HOMEOSTAT_DIGEST_HOUR=23  # Default: 23 (11pm UTC)
```

### Alert Thresholds (Hardcoded)

```typescript
// shared/alerts/config.ts
export const ALERT_THRESHOLDS = {
  budget: {
    early: 75,      // Early warning (daily digest only)
    critical: 90,   // Critical warning (daily digest only)
    enforcement: 100 // Enforcement (GitHub issue, blocks workflow)
  },
  rateLimit: {
    warning: 90,    // Warning (daily digest only)
    enforcement: 100 // Enforcement (workflow fails)
  }
};
```

---

## GPT-5 Expert Analysis Highlights

### Critical Gaps Identified

1. **State Persistence**: File-based JSON without write-back won't persist between runs
   - **Fix**: Commit state to repo or use GitHub Actions cache
   - **Chosen**: Commit-based (already implemented in Phase 1A)

2. **Concurrency Risks**: Parallel workflows can double-spend
   - **Fix**: Use GitHub Actions concurrency groups
   - **Implementation**: `concurrency.group: homeostat-budget-${{ github.repository }}`

3. **Time Boundaries**: Mixed sliding/calendar windows need explicit rules
   - **Fix**: Normalize to UTC, store `last_rollover_utc_date`
   - **Implementation**: Already handled in Phase 1A

### Actionable Recommendations

1. **Minimal Pre-flight Estimator**: Conservative worst-case estimator sufficient at current scale
   - Defer tier probability modeling until >20% error for 2+ weeks

2. **Alerting Scope**: Defer 75%/90% digests
   - Start with 100% enforcement alerts only to prove usefulness
   - Avoid alert fatigue

3. **Legacy Caps**: Per-run $1 cap remains as outer guardrail
   - Daily cap check short-circuits earlier for predictable behavior

4. **Persistence**: Commit state in-repo (recommended)
   - Auditable, portable, no TTL surprises
   - Small commit noise acceptable

5. **Testing Focus**: Deterministic time via injected clock
   - Unit tests for rollover edges (23:59:59 → 00:00:00 UTC)
   - Concurrent run serialization (integration test)

---

## Final Recommendation

### DEFER Phase 1B Until After 30 Days Production Usage

**Rationale**:
1. Budget/rate limits already prevent overspend (alerts are optional)
2. Real usage patterns will inform better alert thresholds
3. May discover alerts aren't needed (budgets rarely hit in practice)
4. Focus engineering time on core fix pipeline first

### Alternative: Minimal Phase 1B (1 hour)

If immediate visibility is critical:
- Only 100% threshold alerts (GitHub Issues)
- No daily digest or weekly reports
- Defer sophisticated reporting until proven need

### When to Implement Full Phase 1B

Implement if any of these conditions met after 30 days:
- Budget hit 100% threshold 3+ times
- Developer feedback requests better visibility
- Need to optimize tier distribution (data shows over-escalation)
- Cross-repo budget exhaustion patterns observed

### Implementation Priority

**If proceeding with full Phase 1B**:
1. Core alert logic (de-duplication, threshold checking)
2. GitHub issue creation (100% enforcement)
3. Daily digest generation
4. Scheduled workflows
5. Weekly reports (lowest priority - defer if time constrained)

---

## Summary

Phase 1B is **well-architected and implementable in 3-4 hours**, but **deferring until production validation (30+ days) is the optimal strategy**. Budget caps already prevent overspend, making alerts optional. Real usage will inform whether sophisticated reporting (weekly digest, tier analysis) delivers value vs simple 100% enforcement alerts.

**Next Action**: Monitor Convert My File production usage for 30 days, then revisit this plan with real data.
