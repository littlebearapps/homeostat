# Homeostat - Future Enhancements Roadmap

**Status**: Not yet implemented
**Last Updated**: 2025-10-24
**Priority**: Post-production validation (Phase 4+)

---

## Overview

This document outlines planned enhancements for Homeostat after successful production deployment to all target extensions (Convert My File, NoteBridge, PaletteKit). These features are **not required** for initial rollout but will improve reliability, observability, and cost efficiency.

**Decision Criteria**: Implement enhancements only after collecting 6+ months of production data to validate real needs.

---

## Enhancement 1: Canary Deployment Activation

**Status**: ⏳ Code exists (stub), implementation pending
**Priority**: Medium
**Estimated Effort**: 8-10 hours
**Prerequisites**:
- All 3 extensions deployed successfully
- 100+ fixes completed across extensions
- Error rate monitoring infrastructure

### Current State

The codebase includes `homeostat/deployment/canary.js` with basic structure:
- Stage definitions (1%, 5%, 25%, 100%)
- Duration and failure thresholds per stage
- Placeholder rollback logic

### What Needs Implementation

#### 1.1 Chrome Extension Distribution Logic (3-4 hours)

**File**: `homeostat/deployment/chrome-distribution.js`

**Functionality**:
- Update `manifest.json` with canary version flag
- Add canary percentage to `chrome.storage.sync`
- Distribute flag to subset of users via Chrome Web Store API

**Implementation**:
```javascript
// Add to manifest.json
{
  "version_name": "1.2.3-canary",
  "canary_percentage": 1  // 1%, 5%, 25%, or 100%
}

// Runtime check in extension
chrome.storage.sync.get(['canaryEnabled'], (result) => {
  if (result.canaryEnabled && Math.random() * 100 < canaryPercentage) {
    // Use new code
  } else {
    // Use stable code
  }
});
```

**Tests**:
- Verify percentage distribution (10,000 simulated users)
- Test manifest update workflow
- Validate Chrome Web Store API integration

---

#### 1.2 Real-Time Error Rate Monitoring (2-3 hours)

**File**: `homeostat/deployment/error-monitor.js`

**Functionality**:
- Query Logger Plausible analytics for error rates
- Compare canary vs stable error rates
- Trigger rollback if canary errors exceed threshold

**Implementation**:
```javascript
async function monitorErrorRate(canaryVersion, duration) {
  const startTime = Date.now();
  const endTime = startTime + parseDuration(duration);

  while (Date.now() < endTime) {
    const canaryErrors = await getErrorRate(canaryVersion);
    const stableErrors = await getErrorRate('stable');

    if (canaryErrors > stableErrors * 1.5) {
      // 50% increase threshold
      return { shouldRollback: true, reason: 'error_rate_spike' };
    }

    await sleep(60000); // Check every minute
  }

  return { shouldRollback: false };
}
```

**Integration**:
- Connect to Logger's Plausible analytics
- Filter errors by version tag
- Calculate rate per 1000 users

---

#### 1.3 Automated Rollback (2-3 hours)

**File**: `homeostat/deployment/rollback.js`

**Functionality**:
- Revert `manifest.json` changes
- Close canary PR
- Restore previous version flags
- Notify team via GitHub issue comment

**Implementation**:
```javascript
async function rollback(issueNumber, canaryVersion, reason) {
  // 1. Revert manifest.json
  await git.checkout('HEAD~1', 'manifest.json');

  // 2. Close canary PR
  await gh.pr.close(canaryPR);

  // 3. Update issue
  await gh.issue.comment(issueNumber, {
    body: `⚠️ Canary rollback triggered\nReason: ${reason}\nVersion: ${canaryVersion}`
  });

  // 4. Reset chrome.storage flags
  await resetCanaryFlags();
}
```

**Tests**:
- Test rollback on simulated failure
- Verify manifest restoration
- Check PR closure
- Validate notification sent

---

### Success Metrics

- **Rollback rate**: <5% of canary deployments
- **Detection time**: Catch issues within 1 hour of canary start
- **False positive rate**: <2% rollbacks for non-critical issues

### Decision Point

**Implement when**:
- ✅ 100+ fixes deployed across 3 extensions
- ✅ Error rate data available from Logger analytics
- ✅ Team capacity available (8-10 hours)

**Skip if**:
- Extension error rates stable (<1 error/1000 users/day)
- Manual rollback feasible (low deployment frequency)

---

## Enhancement 2: Slack Integration

**Status**: ⏳ Not implemented
**Priority**: Low
**Estimated Effort**: 2-3 hours
**Prerequisites**: Active Slack workspace, webhook URL

### What Needs Implementation

#### 2.1 Notification System (1-2 hours)

**File**: `shared/observability/slack.ts`

**Functionality**:
- Send notifications on: fix success, fix failure, cost threshold exceeded
- Configurable notification levels (critical, warning, info)
- Rate limiting (max 10 notifications/hour)

**Implementation**:
```typescript
export class SlackNotifier {
  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
    this.sentNotifications = new Map(); // For deduplication
  }

  async notifyFixSuccess(issueNumber: number, tier: number, prUrl: string) {
    await this.send({
      text: `✅ Fix deployed`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `Issue #${issueNumber} fixed via Tier ${tier}` }
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `PR: ${prUrl}` }
        }
      ]
    });
  }

  async notifyFixFailure(issueNumber: number, tier: number, reason: string) {
    // 24h deduplication
    const key = `failure-${issueNumber}`;
    if (this.sentNotifications.has(key)) return;

    await this.send({
      text: `⚠️ Fix failed: ${reason}`,
      blocks: [...] // Similar structure
    });

    this.sentNotifications.set(key, Date.now());
  }
}
```

**Tests**:
- Test webhook delivery
- Verify deduplication (same issue, multiple failures)
- Check rate limiting enforcement

---

#### 2.2 Alert Integration (1 hour)

**File**: `shared/observability/alerts.ts` (update existing)

**Changes**:
- Add Slack notifier to alert manager
- Update SLO checks to send Slack messages
- Configure notification levels per alert type

**Example**:
```typescript
if (costExceeded) {
  await slackNotifier.notifyBudgetExceeded(projectedCost, budget);
  // Also keep existing console.warn
}
```

---

### Success Metrics

- **Notification latency**: <5 minutes from event
- **False alarm rate**: <5% of notifications
- **Team engagement**: >80% of critical notifications acknowledged within 1 hour

### Decision Point

**Implement when**:
- Team wants centralized notifications
- Email monitoring insufficient
- Multiple team members need alerts

**Skip if**:
- Solo developer (GitHub notifications sufficient)
- Low fix volume (<10 fixes/week)

---

## Enhancement 3: Metrics Dashboard

**Status**: ⏳ Not implemented
**Priority**: Low
**Estimated Effort**: 6-8 hours
**Prerequisites**: 3+ months of production data

### What Needs Implementation

#### 3.1 Data Aggregation Script (2-3 hours)

**File**: `scripts/aggregate-metrics.ts`

**Functionality**:
- Parse GitHub Actions logs
- Extract: success rate, cost per tier, latency, fix count
- Generate JSON data file for dashboard

**Implementation**:
```typescript
interface MetricsData {
  period: string; // "2025-10-24"
  successRate: { tier1: number; tier2: number; tier3: number };
  costs: { tier1: number; tier2: number; tier3: number; total: number };
  fixCount: { tier1: number; tier2: number; tier3: number };
  latency: { median: number; p95: number };
}

async function aggregateWeeklyMetrics(): Promise<MetricsData[]> {
  const workflows = await gh.actions.listWorkflowRuns({ status: 'completed' });
  // Parse logs, extract metrics
  // Group by week
  // Calculate aggregates
}
```

---

#### 3.2 Dashboard Frontend (3-4 hours)

**File**: `dashboard/index.html`

**Functionality**:
- Static HTML + Chart.js
- Charts: Success rate trend, cost breakdown, tier distribution
- Hosted on GitHub Pages or Cloudflare Pages

**Implementation**:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Homeostat Metrics</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <canvas id="successRateChart"></canvas>
  <canvas id="costChart"></canvas>
  <script>
    fetch('metrics.json')
      .then(res => res.json())
      .then(data => {
        // Render charts with Chart.js
      });
  </script>
</body>
</html>
```

---

#### 3.3 Automated Updates (1 hour)

**File**: `.github/workflows/update-dashboard.yml`

**Functionality**:
- Weekly cron job (Sundays at midnight)
- Run aggregation script
- Commit updated `metrics.json`
- Trigger GitHub Pages deployment

**Implementation**:
```yaml
name: Update Dashboard
on:
  schedule:
    - cron: '0 0 * * 0' # Sundays at midnight
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Aggregate metrics
        run: npm run metrics:aggregate
      - name: Commit data
        run: |
          git add dashboard/metrics.json
          git commit -m "chore: update dashboard metrics"
          git push
```

---

### Success Metrics

- **Update frequency**: Weekly automated updates
- **Data accuracy**: ±5% vs manual calculation
- **Load time**: <2 seconds on GitHub Pages

### Decision Point

**Implement when**:
- 3+ months of production data available
- Team wants visual trends
- Manual log review becomes tedious

**Skip if**:
- Fix volume low (<20 fixes/month)
- GitHub Actions logs sufficient
- No team requirement for dashboards

---

## Enhancement 4: Self-Healing Loop (Pattern Learning)

**Status**: ⏳ Not implemented
**Priority**: Medium (long-term cost optimization)
**Estimated Effort**: 12-15 hours
**Prerequisites**: 6+ months production data, 200+ successful fixes

### Current State

See `docs/SELF-HEALING-LOOP-IMPLEMENTATION.md` for complete design.

**Key Insight**: Common error patterns (e.g., "Cannot read property 'X' of undefined") can be fixed without AI calls using pattern matching, reducing costs by 30-40%.

### What Needs Implementation

#### 4.1 Pattern Extraction (4-5 hours)

**File**: `shared/patterns/extractor.ts`

**Functionality**:
- Analyze successful fixes from GitHub PRs
- Extract: error signature → fix pattern mapping
- Store patterns in `shared/patterns/library.json`

**Implementation**:
```typescript
interface FixPattern {
  errorSignature: string; // Regex pattern
  errorType: string; // TypeError, ReferenceError, etc.
  fixTemplate: string; // Code template with placeholders
  successRate: number; // 0-1
  useCount: number;
}

async function extractPatterns(): Promise<FixPattern[]> {
  const successfulFixes = await gh.search.issues({
    q: 'is:pr label:homeostat-fix is:merged',
    per_page: 100
  });

  const patterns: FixPattern[] = [];
  for (const pr of successfulFixes) {
    const { errorSignature, fixCode } = await analyzePR(pr);
    patterns.push({
      errorSignature,
      errorType: detectErrorType(errorSignature),
      fixTemplate: generalizeFix(fixCode),
      successRate: 1.0, // Initial
      useCount: 0
    });
  }

  return deduplicatePatterns(patterns);
}
```

**Tests**:
- Test pattern extraction on 50+ real PRs
- Verify deduplication (similar patterns merged)
- Validate fix template generalization

---

#### 4.2 Pattern Matching (3-4 hours)

**File**: `shared/patterns/matcher.ts`

**Functionality**:
- Match incoming error against pattern library
- Apply fix template if confidence >80%
- Fallback to AI if no match

**Implementation**:
```typescript
async function tryPatternMatch(error: ErrorReport): Promise<FixResult | null> {
  const patterns = await loadPatternLibrary();

  for (const pattern of patterns.sort((a, b) => b.successRate - a.successRate)) {
    const confidence = calculateConfidence(error, pattern);

    if (confidence > 0.8) {
      const fix = applyTemplate(pattern.fixTemplate, error);
      return {
        fix,
        source: 'pattern',
        patternId: pattern.id,
        confidence
      };
    }
  }

  return null; // No match, fallback to AI
}
```

**Integration**:
```typescript
// In orchestrator.ts
const patternFix = await tryPatternMatch(error);
if (patternFix && patternFix.confidence > 0.8) {
  // Use pattern fix (no AI cost)
  return patternFix;
}

// Fallback to AI tiers
const tierConfig = selectModel(error);
// ... existing AI logic
```

---

#### 4.3 Feedback Loop (3-4 hours)

**File**: `shared/patterns/learner.ts`

**Functionality**:
- Track pattern success/failure
- Update `successRate` based on test results
- Retire patterns with <50% success rate

**Implementation**:
```typescript
async function updatePatternStats(patternId: string, testsPassed: boolean) {
  const pattern = await loadPattern(patternId);

  pattern.useCount++;
  const alpha = 0.1; // Learning rate
  pattern.successRate = testsPassed
    ? pattern.successRate + alpha * (1 - pattern.successRate)
    : pattern.successRate - alpha * pattern.successRate;

  if (pattern.successRate < 0.5 && pattern.useCount > 10) {
    await retirePattern(patternId);
  }

  await savePattern(pattern);
}
```

---

#### 4.4 Cost Impact Analysis (2 hours)

**File**: `scripts/analyze-pattern-savings.ts`

**Functionality**:
- Compare: pattern fixes vs AI fixes
- Calculate cost savings
- Report monthly

**Example Output**:
```
Pattern Learning Report - October 2025
=====================================
Total Fixes: 87
- Pattern matches: 31 (35.6%)
- AI fixes: 56 (64.4%)

Cost Savings:
- AI cost (all fixes): $0.52
- Actual cost (with patterns): $0.33
- Savings: $0.19 (36.5%)

Top Patterns:
1. null-property-access (12 uses, 91% success)
2. undefined-chrome-api (8 uses, 87% success)
3. async-race-condition (5 uses, 80% success)
```

---

### Success Metrics

- **Pattern match rate**: >30% of fixes use patterns (no AI cost)
- **Pattern accuracy**: >85% success rate
- **Cost reduction**: 30-40% reduction in AI API costs
- **False positive rate**: <5% (pattern suggested but tests failed)

### Decision Point

**Implement when**:
- ✅ 200+ successful fixes across extensions
- ✅ Recurring error patterns identified manually
- ✅ Cost >$5/month (pattern savings worthwhile)

**Skip if**:
- Errors highly diverse (no common patterns)
- Fix volume low (<30 fixes/month)
- Cost already under budget

---

## Enhancement 5: Multi-Repository Support

**Status**: ⏳ Not implemented
**Priority**: Medium
**Estimated Effort**: 4-6 hours
**Prerequisites**: Successful rollout to 3 Chrome extensions

### What Needs Implementation

**Current Limitation**: Homeostat is cloned per-repository (wasteful, duplicate maintenance)

**Proposed Solution**: Centralized Homeostat repository with reusable workflow

#### 5.1 GitHub Reusable Workflow (2-3 hours)

**File**: `.github/workflows/fix-error.yml` (in Homeostat repo)

**Functionality**:
- Expose as reusable workflow
- Accept: repository context, issue number
- Return: PR URL, fix status

**Implementation**:
```yaml
name: Homeostat Fix Error

on:
  workflow_call:
    inputs:
      issue_number:
        required: true
        type: number
      repository:
        required: true
        type: string
    secrets:
      DEEPSEEK_API_KEY:
        required: true
      OPENAI_API_KEY:
        required: true
    outputs:
      pr_url:
        description: "Pull request URL"
        value: ${{ jobs.fix.outputs.pr_url }}
      status:
        description: "Fix status (success/failure)"
        value: ${{ jobs.fix.outputs.status }}

jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: ${{ inputs.repository }}

      - uses: actions/checkout@v4
        with:
          repository: littlebearapps/homeostat
          path: .homeostat

      - name: Process Issue
        run: |
          cd .homeostat
          npm ci
          node homeostat/orchestrator.js \
            --issue-number ${{ inputs.issue_number }} \
            --repository ${{ inputs.repository }}
```

---

#### 5.2 Extension Repository Workflow (Simplified) (1 hour)

**File**: `.github/workflows/homeostat.yml` (in each extension)

**Implementation**:
```yaml
name: Homeostat
on:
  issues:
    types: [labeled]

jobs:
  auto-fix:
    if: contains(github.event.issue.labels.*.name, 'robot')
    uses: littlebearapps/homeostat/.github/workflows/fix-error.yml@main
    with:
      issue_number: ${{ github.event.issue.number }}
      repository: ${{ github.repository }}
    secrets:
      DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

**Benefits**:
- DRY (Don't Repeat Yourself) - single source of truth
- Easy updates (update Homeostat repo, all extensions benefit)
- Reduced maintenance burden

---

#### 5.3 Version Pinning Strategy (1-2 hours)

**Documentation**: `docs/VERSIONING.md`

**Strategy**:
- Extensions pin to specific Homeostat version: `@v1.0.0`
- Major version changes require manual opt-in
- Security patches auto-deploy via `@v1` tag

**Implementation**:
```yaml
# Conservative (manual upgrades)
uses: littlebearapps/homeostat/.github/workflows/fix-error.yml@v1.0.0

# Auto-patch (security fixes)
uses: littlebearapps/homeostat/.github/workflows/fix-error.yml@v1

# Bleeding edge (not recommended)
uses: littlebearapps/homeostat/.github/workflows/fix-error.yml@main
```

---

### Success Metrics

- **Deployment time**: <5 minutes to add Homeostat to new repo
- **Maintenance burden**: 1 central update vs 3+ repo updates
- **Version consistency**: All repos on same Homeostat version

### Decision Point

**Implement when**:
- ✅ All 3 target extensions using Homeostat successfully
- ✅ Need to add 4th+ repository
- ✅ Maintenance burden becomes significant

**Skip if**:
- Only 1-2 repositories using Homeostat
- Extension-specific customization needed

---

## Implementation Priority

Based on production validation and data collection:

| Enhancement | Priority | Implement When | Estimated ROI |
|-------------|----------|----------------|---------------|
| Multi-Repository Support | HIGH | After 3 extensions | High (reduces maintenance) |
| Self-Healing Loop | MEDIUM | After 6 months data | High (30-40% cost savings) |
| Canary Deployment | MEDIUM | After 100+ fixes | Medium (risk reduction) |
| Slack Integration | LOW | When team needs it | Low (convenience only) |
| Metrics Dashboard | LOW | After 3+ months | Low (visibility only) |

---

## Decision Framework

**Before implementing any enhancement, validate**:

1. **Real Need**: Is manual workaround insufficient?
2. **Data Availability**: Do we have enough production data?
3. **Cost-Benefit**: Does ROI justify development time?
4. **Team Capacity**: Do we have 4-15 hours available?

**Default Answer**: Wait until production proves the need.

---

## Notes

- All enhancements marked as **⏳ Not implemented** in codebase
- Refer to this document before planning Phase 4+ work
- Update priorities quarterly based on production learnings
- Consider AI trends (e.g., cheaper models may reduce pattern learning ROI)

**Last Review**: 2025-10-24
**Next Review**: 2025-04-24 (6 months post-deployment)
