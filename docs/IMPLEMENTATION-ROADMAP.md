# Homeostat - Implementation Roadmap

**Date**: 2025-10-23
**Status**: Ready to Begin
**Total Timeline**: 48-66 hours
**Cost**: $9.28/year (97.7% savings vs original plan)

---

## Executive Summary

**What We're Building**:
1. **Privacy-First Error Logger** - Catches bugs in Chrome extensions (NoteBridge, PaletteKit, ConvertMyFile)
2. **Homeostat** - Automatically fixes bugs via AI + GitHub Actions
3. **Canary Deployment** - Progressive rollout (1% → 5% → 25% → 100%)

**Key Decisions Made**:
- ✅ **GitHub Projects via gh CLI** (not Linear, not MCP) - $0/year, 0 hours dev time
- ✅ **Tiered Privacy Strategy** - DeepSeek for generic, GPT-5 for sensitive (9.5/10 privacy)
- ✅ **2-Attempt Retry Logic** - Catches flaky tests (+18% cost, +15% reliability)
- ✅ **Privacy Option A** - Hybrid DeepSeek + GPT-5 ($8.50/year AI cost)

**Final Cost**: $9.28/year total (AI + retry overhead)

---

## Table of Contents

1. [Phase 0: Privacy & Security (8-10 hours)](#phase-0-privacy--security)
2. [Phase 1: Error Logger Core (5-7 hours)](#phase-1-error-logger-core)
3. [Phase 2: Cloudflare Worker (6-8 hours)](#phase-2-cloudflare-worker)
4. [Phase 3: Homeostat (22-31 hours)](#phase-3-homeostat)
5. [Phase 4: NoteBridge Integration (2-3 hours)](#phase-4-notebridge-integration)
6. [Phase 5: Rollout to Other Extensions (4-6 hours)](#phase-5-rollout-to-other-extensions)
7. [Success Metrics](#success-metrics)
8. [Monitoring & Alerts](#monitoring--alerts)

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

**Ready for**: Phase 1 (Error Logger Core)

---

## Phase 1: Error Logger Core

**Timeline**: Week 3 (5-7 hours)
**Status**: Ready after Phase 0
**Priority**: HIGH

### M1: Client Logger with Fingerprinting (4-6 hours)

**File**: `shared/error-logger.js`

**Deliverables**:

#### 1.1 Tier 1: Local Storage (2-3 hours)

```javascript
class ErrorLogger {
  static async init(extensionId) {
    // Browser context detection
    const isServiceWorker = typeof window === 'undefined';

    // Global error handlers
    if (isServiceWorker) {
      self.addEventListener('error', (e) => this.capture(e.error));
      self.addEventListener('unhandledrejection', (e) => this.capture(e.reason));
    } else {
      window.addEventListener('error', (e) => this.capture(e.error));
      window.addEventListener('unhandledrejection', (e) => this.capture(e.reason));
    }

    // Cleanup old errors (30 days)
    chrome.alarms.create('error-cleanup', { periodInMinutes: 1440 });
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'error-cleanup') {
        await this.clearOldErrors(30 * 24 * 60 * 60 * 1000);
      }
    });
  }

  static async capture(error, metadata = {}) {
    const errorId = this.generateFingerprint(error);

    // Store in chrome.storage.local
    const errorData = {
      id: errorId,
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      extension: metadata.extension,
      surface: metadata.surface,
      metadata: metadata,
      reported: false
    };

    await chrome.storage.local.set({ [`error_${errorId}`]: errorData });

    // Track in Plausible (Tier 2)
    await this.trackInPlausible(errorData);
  }

  static generateFingerprint(error) {
    // Deduplicate errors by message + first stack frame
    const firstFrame = error.stack?.split('\n')[1] || '';
    const fingerprint = `${error.message}:${firstFrame}`;
    return this.hash(fingerprint);
  }

  static hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
```

**Tests**:
- Service worker context detection
- Window context detection
- Error deduplication (same fingerprint)
- Storage quota management
- 30-day cleanup

---

#### 1.2 Tier 2: Plausible Analytics (1-2 hours)

```javascript
static async trackInPlausible(errorData) {
  // Anonymous metrics only (NO stack traces)
  await fetch('https://plausible.io/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domain: 'littlebearapps.com',
      name: 'error',
      props: {
        extension: errorData.extension,
        error_type: errorData.message.split(':')[0], // e.g., "TypeError"
        surface: errorData.surface
      }
    })
  });
}
```

**Tests**:
- Error pattern tracking
- No PII sent (no stack traces)
- Plausible API integration

---

#### 1.3 Tier 3: Manual Reporting (1 hour)

```javascript
static async reportToGitHub(errorId, userDescription) {
  const error = await chrome.storage.local.get(`error_${errorId}`);

  // Sanitize before sending (uses Phase 0 sanitizer)
  const sanitized = await sanitizeForAPI(error.stack, error.stack);

  // Call Cloudflare Worker (Phase 2)
  const response = await fetch('https://homeostat-worker-prod.workers.dev/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `[${error.extension}] ${error.message}`,
      stack: sanitized.stackTrace,
      userDescription: userDescription,
      metadata: error.metadata
    })
  });

  const result = await response.json();
  return result.issueUrl; // GitHub issue URL
}
```

**Tests**:
- Privacy warning shown before report
- PII sanitization applied
- GitHub issue creation
- Rate limiting (60s cooldown)

---

### M2: Breadcrumbs + Enriched Metadata (2-3 hours)

**File**: `shared/error-logger.js` (extension)

**Deliverables**:

#### 2.1 User Action Tracking

```javascript
class ErrorLogger {
  static breadcrumbs = [];

  static addBreadcrumb(action, data = {}) {
    this.breadcrumbs.push({
      timestamp: Date.now(),
      action: action,
      data: data
    });

    // Keep last 20 breadcrumbs
    if (this.breadcrumbs.length > 20) {
      this.breadcrumbs.shift();
    }
  }

  static async capture(error, metadata = {}) {
    const errorData = {
      ...metadata,
      breadcrumbs: this.breadcrumbs.slice(-10), // Last 10 actions
      userAgent: navigator.userAgent,
      extensionVersion: chrome.runtime.getManifest().version,
      timestamp: Date.now()
    };

    // ... rest of capture logic
  }
}
```

**Usage Example**:
```javascript
// In NoteBridge
ErrorLogger.addBreadcrumb('note_saved', { noteId: 'abc123' });
ErrorLogger.addBreadcrumb('sync_started');
ErrorLogger.addBreadcrumb('api_request', { endpoint: '/notes' });
// Error occurs
// Breadcrumbs included in error report
```

**Tests**:
- Breadcrumb FIFO queue (max 20)
- Last 10 breadcrumbs in error report
- Breadcrumb data sanitization

---

### Phase 1 Deliverable

**Working Error Logger**:
- ✅ Tier 1: Local storage (automatic capture, 30-day retention)
- ✅ Tier 2: Plausible analytics (anonymous patterns)
- ✅ Tier 3: Manual GitHub reporting (privacy warning, sanitized)
- ✅ Breadcrumbs: User action tracking
- ✅ Browser context support: Service workers + window

**Ready for**: Phase 2 (Cloudflare Worker)

---

## Phase 2: Cloudflare Worker

**Timeline**: Week 4 (6-8 hours)
**Status**: Ready after Phase 1
**Priority**: HIGH

### Worker Responsibilities

1. **GitHub Issue Creation** (Tier 3 endpoint)
2. **Rate Limiting** (60s per-IP cooldown via KV)
3. **Input Validation** (100KB max body, 10KB max stack)
4. **Origin Validation** (chrome-extension:// only)

### Implementation (Already Complete!)

**Status**: ✅ Worker already deployed (see logger README.md)
- Dev: https://logger-worker-dev.nathan-55a.workers.dev
- Prod: https://logger-worker-prod.nathan-55a.workers.dev
- Smoke tests: ✅ Passing (Issues #4, #5 closed)

**No work needed** - Worker is production-ready!

**Integration**: Update `shared/error-logger.js` to point at prod URL

---

## Phase 3: Homeostat

**Timeline**: Week 5-7 (22-31 hours)
**Status**: Ready after Phase 0-2
**Priority**: MEDIUM (ship logger first, add Homeostat later)

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

#### 3.1: GitHub Actions Workflow (4-6 hours)

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

#### 3.2: Complexity Analyzer (2-3 hours)

**File**: `homeostat/routing/complexity-analyzer.js`

Reuses Phase 0 `model-selector.js`:
- Extract error from GitHub issue body
- Call `selectModel(error)`
- Output: `{ tier: 1, model: 'deepseek-v3.2-exp', attempts: 2 }`

---

#### 3.3: Multi-Tier AI Integration (6-9 hours)

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

#### 3.4: Test Suite Gating (2-3 hours)

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

#### 3.5: Canary Deployment (8-10 hours)

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

### Phase 3 Deliverable

**Homeostat**:
- ✅ GitHub Actions workflow (triggered on 'robot' label)
- ✅ Complexity analyzer (uses Phase 0 routing)
- ✅ Multi-tier AI (DeepSeek + GPT-5 with retry logic)
- ✅ Test suite gating (only deploy if tests pass)
- ✅ Canary deployment (1% → 100% with rollback)
- ✅ GitHub Projects integration (gh CLI for issue updates)

**Cost**: $9.28/year for 1,000 fixes

---

## Phase 4: NoteBridge Integration

**Timeline**: Week 8 (2-3 hours)
**Status**: Ready after Phase 1
**Priority**: HIGH (pilot extension)

### Tasks

#### 4.1: Install Logger (1 hour)

```javascript
// notebridge/shared/error-logger.js
// Copy from homeostat repo

// notebridge/background/service-worker.js
import { ErrorLogger } from '../shared/error-logger.js';

ErrorLogger.init('notebridge');

// notebridge/popup/popup.js
import { ErrorLogger } from '../shared/error-logger.js';

ErrorLogger.init('notebridge');
```

#### 4.2: Add Breadcrumbs (1 hour)

```javascript
// Track user actions
ErrorLogger.addBreadcrumb('note_created', { noteId });
ErrorLogger.addBreadcrumb('note_saved');
ErrorLogger.addBreadcrumb('sync_started');
```

#### 4.3: Test & Validate (30 min - 1 hour)

- Trigger test error
- Verify local storage
- Verify Plausible tracking
- Test manual GitHub report

---

## Phase 5: Rollout to Other Extensions

**Timeline**: Week 9-10 (4-6 hours)
**Status**: Ready after Phase 4
**Priority**: MEDIUM

### PaletteKit (2-3 hours)
- Install logger
- Add breadcrumbs (color picker actions)
- Test & validate

### ConvertMyFile (2-3 hours)
- Install logger
- Add breadcrumbs (file conversion actions)
- Test & validate

---

## Success Metrics

### Error Detection
- **Target**: >90% of runtime errors captured
- **Measure**: Compare Plausible error count vs user reports

### Privacy Compliance
- **Target**: Zero PII leaks
- **Measure**: Audit GitHub issues monthly for sanitization failures

### Bundle Size
- **Target**: <3KB total
- **Measure**: Webpack bundle analyzer

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

- Total errors captured
- Errors auto-fixed
- Canary deployments
- Rollbacks

### Monthly (Review)

- Privacy audit (check for PII leaks)
- Cost analysis (vs budget)
- Success rate trends
- Extension-specific error patterns

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|------------|
| **Phase 0**: Privacy & Security | 8-10 hours | 8-10 hours |
| **Phase 1**: Error Logger Core | 5-7 hours | 13-17 hours |
| **Phase 2**: Cloudflare Worker | 0 hours (done!) | 13-17 hours |
| **Phase 3**: Homeostat | 22-31 hours | 35-48 hours |
| **Phase 4**: NoteBridge Integration | 2-3 hours | 37-51 hours |
| **Phase 5**: Other Extensions | 4-6 hours | 41-57 hours |
| **Buffer** | 10% | **45-63 hours** |

**Realistic Timeline**: 6-9 weeks (10-15 hours/week)

---

## Cost Summary

### Development (One-Time)
- Time: 45-63 hours @ your value = Priceless 😊
- Tools: $0 (all open-source)

### Operating (Annual)
- AI APIs: $9.28/year (DeepSeek + GPT-5 with retry)
- GitHub Actions: $0/year (Team plan: 3,000 min/month)
- GitHub Projects: $0/year (gh CLI, no MCP needed)
- Cloudflare Worker: $0/year (100k req/day free tier)
- Linear: $0/year (not using it)
- **Total**: **$9.28/year**

### Savings vs Original Plan
- Original: $17 AI + $384 Linear = $401/year
- New: $9.28/year
- **Savings: $391.72/year (97.7%)** 🎉

---

## Next Steps

**Ready to start?** Begin with Phase 0 (Privacy & Security) - the foundation everything else builds on.

**Questions?** See comprehensive docs:
- `PRIVACY-SECURITY-GUIDE.md` - Complete privacy implementation
- `FOLLOW-UP-QUESTIONS-ANSWERED.md` - All 6 questions answered
- `DEEPSEEK-MULTI-AI-ARCHITECTURE.md` - Multi-tier AI strategy

**Let's ship it!** 🚀
