# Homeostat - Implementation Roadmap

**Date**: 2025-10-23
**Status**: Ready to Begin
**Total Timeline**: 30-41 hours (Homeostat only)
**Cost**: $9.28/year (97.7% savings vs original plan)

---

## Executive Summary

**What We're Building**:

**Homeostat** - An automated bug-fixing system that uses AI (DeepSeek V3.2-Exp + GPT-5) and GitHub Actions to detect, analyze, and repair errors in Chrome extensions.

**How it works**:
1. [Logger](https://github.com/littlebearapps/logger) captures errors and creates GitHub issues with `robot` label
2. Homeostat analyzes complexity and selects appropriate AI tier
3. AI attempts fix with retry logic
4. Tests validate the fix
5. Canary deployment progressively rolls out (1% → 5% → 25% → 100%)
6. Automatic rollback if error rate increases

**Key Decisions Made**:
- ✅ **GitHub Projects via gh CLI** (not Linear, not MCP) - $0/year, 0 hours dev time
- ✅ **Tiered Privacy Strategy** - DeepSeek for generic, GPT-5 for sensitive (9.5/10 privacy)
- ✅ **2-Attempt Retry Logic** - Catches flaky tests (+18% cost, +15% reliability)
- ✅ **Privacy Option A** - Hybrid DeepSeek + GPT-5 ($8.50/year AI cost)

**Final Cost**: $9.28/year total (AI + retry overhead)

---

## Table of Contents

1. [Phase 0: Privacy & Security (8-10 hours)](#phase-0-privacy--security)
2. [Phase 1: Homeostat Core (22-31 hours)](#phase-1-homeostat-core)
3. [Success Metrics](#success-metrics)
4. [Monitoring & Alerts](#monitoring--alerts)
5. [Integration with Logger](#integration-with-logger)

---

## Phase 0: Privacy & Security

**Timeline**: Week 1-2 (8-10 hours)
**Status**: MUST DO FIRST (non-negotiable)
**Priority**: CRITICAL

### Why First

Privacy and security are **foundational** - can't build Homeostat without:
- PII sanitization (prevent API key leaks)
- Sensitive file routing (keep auth.js, manifest.json out of DeepSeek)
- Retry logic (reliability foundation)

### Tasks

#### Task 0.1: PII Sanitization Engine (2-3 hours)

**File**: `shared/privacy/sanitizer.js`

**Deliverables**:
- Function: `sanitizeForAPI(code, stackTrace)`
- Regex patterns for:
  - Extension IDs: `chrome-extension://[a-z]{32}`
  - API keys: OpenAI, Stripe, Google, GitHub, Linear, Plausible
  - Emails: `user@domain.com`
  - User paths: `/Users/nathan/`, `/home/user/`
  - JWTs: `eyJ...` tokens
  - OAuth tokens: High-entropy Base64 strings

**Implementation**: See `docs/PRIVACY-SECURITY-GUIDE.md` (complete code provided)

**Tests**:
```javascript
// tests/sanitizer.test.js
- Redacts extension IDs
- Redacts API keys (10+ patterns)
- Redacts email addresses
- Redacts user paths
- Preserves code functionality
```

**Success Criteria**:
- ✅ All 10+ test cases pass
- ✅ No false positives (doesn't break valid code)
- ✅ Entropy-based token detection works

---

#### Task 0.2: Sensitive File Detection (1-2 hours)

**File**: `homeostat/config/sensitive-files.js`

**Deliverables**:
- Array: `SENSITIVE_PATTERNS` (regex patterns)
- Function: `isSensitiveFile(filePath)` → boolean

**Sensitive Files List**:
```javascript
const SENSITIVE_PATTERNS = [
  /^manifest\.json$/,
  /^background\/auth\.js$/,
  /^shared\/api-keys\.js$/,
  /^shared\/oauth\.js$/,
  /^shared\/encryption\.js$/,
  /^shared\/payment\.js$/,
  /^shared\/user-data\.js$/,
  /^config\/secrets\//,
  /^shared\/security\//
];
```

**Tests**:
- Detects manifest.json
- Detects auth files
- Allows generic files (popup.js, utils.js)

**Success Criteria**:
- ✅ All sensitive files correctly identified
- ✅ No false positives (UI files not flagged)

---

#### Task 0.3: Model Selection Logic (2-3 hours)

**File**: `homeostat/routing/model-selector.js`

**Deliverables**:
- Function: `selectModel(error)` → { tier, model, sanitize, attempts }
- Function: `extractFiles(stackTrace)` → string[]

**Decision Logic**:
```javascript
// 1. PRIVACY CHECK (highest priority)
if (filesInvolved.some(f => isSensitiveFile(f))) {
  return { tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 };
}

// 2. COMPLEXITY CHECK
const stackDepth = error.stack.split('\n').length;
const fileCount = filesInvolved.length;

if (stackDepth < 5 && fileCount === 1) {
  return { tier: 1, model: 'deepseek-v3.2-exp', sanitize: true, attempts: 2 };
}

if (stackDepth < 15 && fileCount <= 3) {
  return { tier: 2, model: 'deepseek-v3.2-exp', reviewer: 'gpt-5', sanitize: true, attempts: 2 };
}

return { tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 };
```

**Tests**:
- Sensitive file → Tier 3 (GPT-5)
- Simple error → Tier 1 (DeepSeek)
- Complex error → Tier 3 (GPT-5)
- All paths include sanitization

**Success Criteria**:
- ✅ Sensitive files NEVER go to DeepSeek
- ✅ Complexity routing works
- ✅ All errors get sanitized

---

#### Task 0.4: Retry Logic with Deterministic Detection (3-4 hours)

**File**: `homeostat/execution/retry-handler.js`

**Deliverables**:
- Function: `attemptFixWithRetries(tier, error, maxAttempts)` → result
- Function: `isSameError(attempt1, attempt2)` → boolean
- Levenshtein distance implementation

**Implementation**: See `docs/FOLLOW-UP-QUESTIONS-ANSWERED.md` Question 2 (complete code)

**Logic**:
- Tier 1/2: 2 attempts max
- Tier 3: 1 attempt only
- Same error twice → escalate immediately
- Different errors → legitimate retry

**Tests**:
- Flaky test (different errors) → retries succeed
- Deterministic failure (same error) → escalates immediately
- Success on first attempt → no retry
- Max attempts exhausted → escalates

**Success Criteria**:
- ✅ Catches flaky tests (95%+ reliability)
- ✅ Doesn't waste retries on deterministic failures
- ✅ Cost increase <20% ($5.20/year vs $4.42/year)

---

### Phase 0 Deliverable

**Complete Privacy & Security Foundation**:
- ✅ PII sanitization engine (10+ patterns)
- ✅ Sensitive file detection (9+ patterns)
- ✅ Model selection logic (privacy-first routing)
- ✅ Retry logic (2-attempt strategy)
- ✅ All tests passing (30+ test cases)

**Ready for**: Phase 1 (Homeostat Core)

---

## Phase 1: Homeostat Core

**Timeline**: 22-31 hours
**Status**: Ready after Phase 0
**Priority**: HIGH

### Architecture

```
Error arrives (GitHub Issue)
  ↓
GitHub Actions triggered (on issue labeled 'robot')
  ↓
Complexity Analyzer (uses Phase 0 model-selector.js)
  ↓
┌─────────────┬──────────────┬─────────────┐
│   Tier 1    │    Tier 2    │   Tier 3    │
│  DeepSeek   │ DS + GPT-5   │   GPT-5     │
│   70%       │     25%      │     5%      │
└─────┬───────┴──────┬───────┴──────┬──────┘
      │              │              │
      ▼              ▼              ▼
   Fix + Test    Fix + Review    Fix (complex)
      │              │              │
      └──────────────┴──────────────┘
                     │
                     ▼
              Tests Pass? ──No──> Escalate
                     │
                    Yes
                     ▼
              Canary Deploy (1% → 5% → 25% → 100%)
                     │
                     ▼
              Close Issue (gh CLI)
```

### Tasks

#### 1.1: GitHub Actions Workflow (4-6 hours)

**File**: `.github/workflows/homeostat.yml`

```yaml
name: Homeostat

on:
  issues:
    types: [labeled]

jobs:
  auto-fix:
    if: contains(github.event.issue.labels.*.name, 'robot')
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Analyze Error
        id: analyze
        run: |
          node homeostat/routing/model-selector.js \
            --issue-number ${{ github.event.issue.number }}

      - name: Attempt Fix (Tier 1)
        if: steps.analyze.outputs.tier == '1'
        run: |
          node homeostat/execution/tier1-fix.js \
            --issue-number ${{ github.event.issue.number }}

      - name: Run Tests
        run: npm test

      - name: Deploy Canary
        if: success()
        run: |
          node homeostat/deployment/canary.js \
            --percentage 1

      - name: Update Issue
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --body "Fix deployed to 1% of users. Monitoring..."
```

---

#### 1.2: Complexity Analyzer (2-3 hours)

**File**: `homeostat/routing/complexity-analyzer.js`

Reuses Phase 0 `model-selector.js`:
- Extract error from GitHub issue body
- Call `selectModel(error)`
- Output: `{ tier: 1, model: 'deepseek-v3.2-exp', attempts: 2 }`

---

#### 1.3: Multi-Tier AI Integration (6-9 hours)

**Files**:
- `homeostat/execution/tier1-fix.js` - DeepSeek only
- `homeostat/execution/tier2-fix.js` - DeepSeek + GPT-5 review
- `homeostat/execution/tier3-fix.js` - GPT-5 only

**Implementation**: See `docs/DEEPSEEK-MULTI-AI-ARCHITECTURE.md`

Uses Phase 0 components:
- PII sanitization before API calls
- Sensitive file routing
- Retry logic (2 attempts for Tier 1/2)

---

#### 1.4: Test Suite Gating (2-3 hours)

**File**: `homeostat/execution/test-runner.js`

```javascript
async function runTests() {
  const result = await exec('npm test');

  if (result.exitCode !== 0) {
    return {
      passed: false,
      output: result.stderr,
      shouldEscalate: true
    };
  }

  return { passed: true };
}
```

**Logic**:
- Tests pass → proceed to canary
- Tests fail → retry (if attempts remaining)
- Tests fail twice → escalate to next tier
- All tiers fail → alert human

---

#### 1.5: Canary Deployment (8-10 hours)

**File**: `homeostat/deployment/canary.js`

```javascript
class CanaryDeployment {
  static stages = [
    { percentage: 1, duration: '1h', failureThreshold: 0.01 },
    { percentage: 5, duration: '2h', failureThreshold: 0.02 },
    { percentage: 25, duration: '4h', failureThreshold: 0.05 },
    { percentage: 100, duration: 'permanent', failureThreshold: 0.1 }
  ];

  static async deploy(percentage, issueNumber) {
    // Update chrome.storage.sync with canary flag
    await updateExtensionConfig({
      canaryPercentage: percentage,
      canaryVersion: getCurrentVersion()
    });

    // Monitor error rate
    const errorRate = await monitorErrors(this.stages[stageIndex].duration);

    if (errorRate > this.stages[stageIndex].failureThreshold) {
      // Rollback
      await this.rollback(issueNumber);
    } else {
      // Progress to next stage
      await this.deploy(this.stages[stageIndex + 1].percentage, issueNumber);
    }
  }
}
```

**Tests**:
- Progressive rollout (1% → 5% → 25% → 100%)
- Error rate monitoring
- Automatic rollback
- GitHub issue updates

---

### Phase 1 Deliverable

**Complete Homeostat System**:
- ✅ GitHub Actions workflow (triggered on 'robot' label)
- ✅ Complexity analyzer (uses Phase 0 routing)
- ✅ Multi-tier AI (DeepSeek + GPT-5 with retry logic)
- ✅ Test suite gating (only deploy if tests pass)
- ✅ Canary deployment (1% → 100% with rollback)
- ✅ GitHub Projects integration (gh CLI for issue updates)

**Cost**: $9.28/year for 1,000 fixes

**Ready for**: Extension integration (see [Logger repository](https://github.com/littlebearapps/logger))

---

## Success Metrics

### Privacy Compliance
- **Target**: Zero PII leaks in AI API calls
- **Measure**: Audit sanitization logic monthly, review GitHub issues for leaks

### Homeostat Success Rate
- **Target**: 70% overall (Tier 1: 60-70%, Tier 2: 80-85%, Tier 3: 90-95%)
- **Measure**: Issues closed automatically / total issues

### Cost
- **Target**: <$10/year
- **Actual**: $9.28/year (1,000 fixes)

### Canary Rollback Rate
- **Target**: <5% rollbacks
- **Measure**: Rollbacks / total deployments

---

## Monitoring & Alerts

### Daily (Slack Notifications)

- Tier 1 success rate (target: >60%)
- Tier 2 success rate (target: >80%)
- Tier 3 success rate (target: >90%)
- API cost (target: <$1/month)

### Weekly (Email Summary)

- GitHub issues received (from logger)
- Errors auto-fixed by tier
- Canary deployments
- Rollbacks

### Monthly (Review)

- Privacy audit (check for PII leaks in sanitization)
- Cost analysis (vs $10/year budget)
- Success rate trends by tier
- Extension-specific fix patterns

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| **Phase 0**: Privacy & Security | 8-10 hours | 8-10 hours |
| **Phase 1**: Homeostat Core | 22-31 hours | 30-41 hours |
| **Buffer** | 10% | **33-45 hours** |

**Realistic Timeline**: 3-5 weeks (10-15 hours/week)

**Note**: Logger implementation is in [separate repository](https://github.com/littlebearapps/logger)

---

## Cost Summary

### Development (One-Time)
- Time: 33-45 hours @ your value = Priceless 😊
- Tools: $0 (all open-source)

### Operating (Annual)
- AI APIs: $9.28/year (DeepSeek + GPT-5 with retry)
- GitHub Actions: $0/year (Team plan: 3,000 min/month)
- GitHub Projects: $0/year (gh CLI, no MCP needed)
- **Total**: **$9.28/year**

### Savings vs Original Plan
- Original: $17 AI + $384 Linear = $401/year
- New: $9.28/year
- **Savings: $391.72/year (97.7%)** 🎉

---

## Integration with Logger

**IMPORTANT**: Homeostat receives error reports from the [Logger repository](https://github.com/littlebearapps/logger).

**How integration works**:
1. Logger captures errors in Chrome extensions
2. Logger sanitizes PII and creates GitHub issues
3. Logger adds `robot` label to issue
4. Homeostat GitHub Actions workflow triggers
5. Homeostat analyzes, fixes, tests, and deploys

**Integration contract**: See [docs/LOGGER-INTEGRATION.md](LOGGER-INTEGRATION.md) for complete specification of:
- Expected issue format (title, body sections, required fields)
- Trigger mechanism (`robot` label)
- Parsing logic for extracting error data
- Privacy validation requirements

**Logger repository**: https://github.com/littlebearapps/logger

---

## Next Steps

**Ready to start?** Begin with Phase 0 (Privacy & Security) - the foundation everything else builds on.

**Key Documentation**:
- **[LOGGER-INTEGRATION.md](LOGGER-INTEGRATION.md)** - Integration contract (READ FIRST)
- **[PRIVACY-SECURITY-GUIDE.md](PRIVACY-SECURITY-GUIDE.md)** - Complete privacy implementation with code
- **[DEEPSEEK-MULTI-AI-ARCHITECTURE.md](DEEPSEEK-MULTI-AI-ARCHITECTURE.md)** - Multi-tier AI strategy with edge cases
- **[FOLLOW-UP-QUESTIONS-ANSWERED.md](FOLLOW-UP-QUESTIONS-ANSWERED.md)** - Architectural Q&A

**Let's ship it!** 🚀
