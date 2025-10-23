# Homeostat Implementation - GPT-5 Expert Updates (Legacy)

**Date**: 2025-10-22
**Context**: Nathan asked 3 critical questions about Homeostat (originally called "self-healing loop"). GPT-5 provided expert validation and corrections.
**Note**: This is legacy documentation. See IMPLEMENTATION-ROADMAP.md and DEEPSEEK-MULTI-AI-ARCHITECTURE.md for current implementation plan.

---

## 🔴 CRITICAL CORRECTION: Consumer Subscriptions ≠ API Access

### Nathan's Question
"Can we use my Claude Max 20x plan (headless Claude Code) and my GPT Pro plan (for headless Codex) instead of just using APIs?"

### GPT-5 Answer: NO ❌

**Consumer subscriptions DO NOT grant API access**:
- Claude Max 20x: Web UI access only, NO API credits, NO headless mode
- ChatGPT Pro: Web UI access only, NO API credits, NO headless mode
- Automating web UIs: Violates Terms of Service + brittle

**You MUST use pay-per-use APIs for automation**:
- Anthropic API (Claude Opus): $15/1M input, $75/1M output
- OpenAI API (GPT-4 or o1): $2.50-5/1M input, $10-15/1M output

**Cost Reality**:
- Original self-healing plan: $2-10/month API usage ✅ **Correct**
- Nathan's idea (use subscriptions): $0 incremental ❌ **Doesn't work**

**Revised Cost Model**:
```
Homeostat API Costs (15 errors/month):
- Claude Opus (complex fixes): 5 × 20k tokens × $15/1M = $1.50/month
- OpenAI GPT-4 (safe fixes): 10 × 10k tokens × $2.50/1M = $0.25/month
Total: ~$2-3/month

Year 1: $2,600 setup + $24-36 API costs = $2,624-2,636
3-Year Total: $2,624-2,636 + $72-108 API = $2,696-2,744

Original projection was correct.
```

**Subscriptions remain useful for**:
- Interactive development work (Claude Code IDE usage)
- Manual ChatGPT research/brainstorming
- NOT for automated GitHub Actions workflows

---

## 📦 Logger Enhancements Required

### Nathan's Question
"Have we included in the self-healing loop plan all the information/details/data etc from the logger tool needed for the self-healing loop?"

### GPT-5 Answer: Mostly, but needs enhancements

### Required Enhancement 1: Fingerprinting (CRITICAL)

**Implementation**: Compute on client AND server

**Client-Side** (`shared/error-logger.js`):
```javascript
async function generateFingerprint(error, metadata) {
  // Normalize inputs (remove dynamic parts)
  const normalizedMessage = error.message
    .replace(/\d{13,}/g, '<TIMESTAMP>')         // Remove timestamps
    .replace(/[0-9a-f-]{36}/g, '<UUID>')        // Remove UUIDs
    .replace(/\d{3,}/g, '<NUM>')                // Remove long numbers
    .replace(/:\d+:\d+/g, ':XX:XX');            // Remove line:col

  const normalizedStack = error.stack
    .split('\n')
    .slice(0, 5)  // Top 5 frames only
    .map(frame => frame
      .replace(/chrome-extension:\/\/[^/]+/g, 'chrome-extension://<ID>')
      .replace(/:\d+:\d+/g, ':XX:XX')
      .replace(/\?.*$/g, '')  // Remove query params
    )
    .join('\n');

  // Fingerprint inputs
  const fingerprintInput = [
    error.name,
    normalizedMessage,
    normalizedStack,
    metadata.extension,
    metadata.version.split('.').slice(0, 2).join('.'),  // Major.minor only
    metadata.surface,
    metadata.source,
    navigator.userAgent.split('/')[0],  // Browser name only
    navigator.platform  // OS family
  ].join('|');

  // SHA-256 hash
  const msgBuffer = new TextEncoder().encode(fingerprintInput);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Versioned format
  return `v1:sha256:${hashHex}`;
}
```

**Server-Side** (`worker/src/worker.ts`):
```typescript
// Recompute fingerprint (don't trust client)
const serverFingerprint = await generateServerFingerprint(payload);

// Store BOTH for debugging
const issueMetadata = {
  clientFingerprint: payload.fingerprint,
  serverFingerprint: serverFingerprint,
  fingerprintMatch: payload.fingerprint === serverFingerprint
};

// Use server fingerprint for dedup
const dedupKey = {
  fingerprint: serverFingerprint,
  version: `${metadata.version.split('.').slice(0, 2).join('.')}`,  // Major.minor
  surface: metadata.surface
};
```

**Why Both?**:
- Client: Early deduplication (save network calls)
- Server: Source of truth (prevent client tampering)
- Store both: Debugging (detect sanitizer drift)

---

### Required Enhancement 2: Version-Aware Dedup Keys

**Problem**: Current plan uses fingerprint alone for dedup. This suppresses REAL regressions across versions.

**Example**:
```javascript
// v1.0.0: Bug fixed
fingerprint: "abc123"

// v1.1.0: Bug reintroduced (regression)
fingerprint: "abc123"  // Same fingerprint!

// Current plan: Blocks v1.1.0 report (thinks it's duplicate)
// GPT-5 fix: Include version in dedup key
```

**Fixed Dedup Key**:
```javascript
const dedupKey = {
  fingerprint: serverFingerprint,
  majorMinorVersion: metadata.version.split('.').slice(0, 2).join('.'),
  surface: metadata.surface
};

// v1.0.0 → key: {abc123, "1.0", "popup"}
// v1.1.0 → key: {abc123, "1.1", "popup"}  ← Different key, NOT suppressed
```

---

### Optional Enhancement 3: Enriched Metadata (Nice-to-Have)

**Purpose**: Help AI agents understand context for better fixes

**Additional Fields** (all non-PII):
```javascript
{
  // Runtime environment
  browser: "Chrome/120.0.0.0",       // Full version
  os: "macOS",                        // OS family (not specific version)
  locale: "en-US",
  commitSHA: "abc123def",             // If embedded in extension

  // Feature context
  featureFlagsHash: "sha256:xyz",     // Hashed state (no flag names)
  storageFootprint: "~2MB",           // Approximate, no keys
  grantedPermissions: ["storage", "alarms"],

  // Network context
  networkState: "online",
  recentFetchStatuses: [200, 200, 404],  // Last N fetch results

  // Page context (for content scripts)
  pageTLD: "example.com",             // Hostname TLD+1 only (no full URL)
  protocol: "https",
  frameType: "top",                   // top vs iframe

  // Breadcrumbs (last 1-3 high-level actions, NO PII)
  breadcrumbs: [
    { action: "clicked Save", timestamp: 1729612340000 },
    { action: "opened popup", timestamp: 1729612335000 }
  ],

  // Prevalence tracking
  occurrencesLast24h: 5,
  occurrencesLast7d: 12,

  // Redaction proofs (transparency)
  redactionRulesFired: ["email", "url-params"],
  redactionCounts: 3
}
```

**Why Nice-to-Have**:
- AI agents can see: "This error happens when user is offline"
- AI agents can see: "Last action before error was clicking Save"
- AI agents can see: "This error spiked from 1/day to 50/day (recent change)"

**Privacy Guarantee**:
- No PII (URLs, emails, user data)
- Breadcrumbs are high-level actions only (no button labels, no form data)
- Feature flags are hashed (no flag names visible)

---

### Required Enhancement 4: Sanitizer Parity Testing

**Problem**: Client and server have DUPLICATE sanitizer code. Risk of drift.

**GPT-5 Solution**: Test fixture for parity

**File**: `shared/__tests__/sanitizer-parity.test.js`
```javascript
import { sanitizeText as clientSanitize } from '../sanitizer.js';
import { sanitizeText as serverSanitize } from '../../worker/src/shared/sanitize';

const TEST_VECTORS = [
  {
    input: 'Error at /users/12345/profile',
    expected: 'Error at /users/:id/profile'
  },
  {
    input: 'Email: test@example.com sent',
    expected: 'Email: <EMAIL_REDACTED> sent'
  },
  {
    input: 'UUID: 550e8400-e29b-41d4-a716-446655440000',
    expected: 'UUID: <UUID_REDACTED>'
  },
  {
    input: 'Path: C:\\Users\\JohnDoe\\Documents\\file.txt',
    expected: 'Path: C:\\Users\\<REDACTED>\\Documents\\file.txt'
  },
  {
    input: 'URL: https://example.com?token=abc123&user=456',
    expected: 'URL: https://example.com?<PARAMS_REDACTED>'
  }
];

describe('Sanitizer Parity (Client vs Server)', () => {
  TEST_VECTORS.forEach(({ input, expected }) => {
    it(`sanitizes: ${input.substring(0, 30)}...`, () => {
      const clientResult = clientSanitize(input);
      const serverResult = serverSanitize(input);

      expect(clientResult).toBe(expected);
      expect(serverResult).toBe(expected);
      expect(clientResult).toBe(serverResult);  // PARITY CHECK
    });
  });
});
```

**CI Integration**:
```yaml
# .github/workflows/ci.yml
- name: Test Sanitizer Parity
  run: npm test -- shared/__tests__/sanitizer-parity.test.js
```

---

## 🏗️ Architecture: Separate Self-Healer Repo (Confirmed)

### Nathan's Question
"Should the self-healing loop be built into logger or be a separate tool/setup?"

### GPT-5 Answer: Separate ✅

**Reasoning**:
1. **Reusability**: Self-healer works for ALL GitHub issues (not just logger errors)
2. **Modularity**: Logger = capture errors, Self-healer = fix errors
3. **Permissions**: Clearer separation (GitHub App has limited scope)
4. **Auditing**: Easier to rotate credentials, review auto-merge history

**Architecture**:

```
lba/tools/logger/                    # Error capture system
├── shared/
│   ├── error-logger.js             # Client library (+ fingerprinting)
│   └── sanitizer.js                # Client-side PII sanitization
├── worker/
│   └── src/
│       ├── worker.ts               # Accept + recompute fingerprint
│       └── do/issue-manager.ts     # Durable Object dedup
└── docs/

lba/tools/homeostat/                 # NEW: Auto-fix system (separate repo)
├── .github/
│   └── workflows/
│       ├── auto-triage.yml         # Issue labeling + routing
│       ├── auto-fix.yml            # AI agent invocation
│       ├── auto-merge.yml          # Safety checks + merge
│       └── canary-deploy.yml       # Gradual rollout + monitoring
├── scripts/
│   ├── auto-fix-policy.py          # Policy engine (safe vs critical)
│   ├── invoke-claude-api.py        # Anthropic API integration
│   ├── invoke-openai-api.py        # OpenAI API integration
│   └── monitor-canary.py           # Error rate monitoring
├── config/
│   ├── notebridge.yml              # Extension-specific config
│   ├── convertmyfile.yml
│   └── palettekit.yml
└── docs/
    ├── README.md                   # Self-healer overview
    └── POLICY-ENGINE.md            # Auto-merge safety rules
```

**How They Integrate**:
1. Logger creates GitHub issue with fingerprint metadata
2. Self-healer listens for issues with `auto-triage` label
3. Self-healer reads fingerprint from issue metadata
4. Self-healer proposes fix → CI validates → auto-merge (if safe)

**Clean separation**: Logger doesn't know about self-healer. Self-healer consumes standard GitHub issues.

---

## 🚀 Implementation Priority

### Nathan's Question
(Implied: Should we build for all 3 extensions or start with NoteBridge?)

### GPT-5 Answer: Start with NoteBridge only ✅

**3 Milestones** (over 2 weeks):

### M1 (Day 1): Logger + Fingerprinting
**Time**: 4-6 hours
**Deliverables**:
- `shared/error-logger.js` - Client library with fingerprinting
- `shared/sanitizer.js` - JavaScript duplicate of Worker sanitizer
- `worker/src/worker.ts` - Accept `clientFingerprint`, recompute `serverFingerprint`
- `worker/src/do/issue-manager.ts` - Durable Object dedup with version-aware keys
- `shared/__tests__/sanitizer-parity.test.js` - Parity test fixture

**Success Criteria**:
- Duplicate errors blocked (same fingerprint + version + surface)
- Regressions NOT blocked (same fingerprint, different version)
- GitHub issues include both `clientFingerprint` and `serverFingerprint` in metadata
- Sanitizer parity tests pass in CI

---

### M2 (Day 2): Breadcrumbs + Metadata Enrichment
**Time**: 2-3 hours
**Deliverables**:
- Add breadcrumb tracking to `error-logger.js`
- Add enriched metadata (browser+version, OS, feature flags hash, network state)
- Weekly rollup comments for high-volume fingerprints (Worker cron job)

**Success Criteria**:
- Last 1-3 actions visible in GitHub issue metadata
- AI agents can see: browser version, OS, network state
- High-volume fingerprints get weekly rollup comments (not 100 duplicate issues)

---

### M3 (Week 2): Self-Healer Skeleton
**Time**: 6-8 hours
**Deliverables**:
- New repo: `lba/tools/self-healer/`
- GitHub App authentication (store credentials in GitHub Secrets)
- Issue triage workflow: read labeled issues, fetch code at commit SHA
- CI guardrails: require tests, CODEOWNERS review
- Dry-run mode: produce PR diffs as artifacts (no auto-merge yet)

**Success Criteria**:
- Self-healer can read NoteBridge issues with `auto-triage` label
- Can fetch code at commit SHA (issue metadata includes extension version)
- Dry-run PR diffs show proposed changes (no merge, just preview)

---

## 🔒 Key Risks & Mitigations (GPT-5 Identified)

### Risk 1: Secret Handling in Browser Extensions
**Problem**: Extensions are public, secrets leak if embedded

**Mitigation**:
- ✅ NO client-side secrets (HMAC keys, API tokens)
- ✅ Rely on server-side controls (origin validation, rate limits, honeypot)
- ✅ Use timestamp + UUID for replay protection (no shared secrets)

---

### Risk 2: Sanitizer Drift (Client vs Server)
**Problem**: Client and server sanitizer code can diverge

**Mitigation**:
- ✅ Shared test fixture (`sanitizer-parity.test.js`)
- ✅ Run in CI on both client and Worker repos
- ✅ Alert on parity test failures

**Future**: Centralize sanitizer in shared package (npm workspaces)

---

### Risk 3: Over-Suppression (Version-Aware Dedup)
**Problem**: Fingerprint dedup might block real regressions

**Mitigation**:
- ✅ Version-aware dedup keys (`{fingerprint, majorMinor, surface}`)
- ✅ Sampling for high-volume errors (report 1% instead of 0%)
- ✅ Weekly rollup comments (show volume trends)

---

### Risk 4: Auto-Merge Safety
**Problem**: AI-proposed fixes might break production

**Mitigation**:
- ✅ Restrict to labeled, low-risk PRs (docs, tests, telemetry, obvious null checks)
- ✅ Enforce CI passing (all tests green)
- ✅ Require 1 CODEOWNERS reviewer for runtime logic changes
- ✅ Canary deployment (5% rollout, monitor error rate, auto-rollback)

---

### Risk 5: Codex Cloud Assumptions
**Problem**: Original plan assumed Codex Cloud for headless automation

**Mitigation**:
- ✅ Use OpenAI API instead (pay-per-use)
- ✅ Avoid bespoke config (root `package.json` delegation is least risky fix)
- ✅ Document assumptions (if Codex Cloud integration needed later)

---

## 📋 Actionable Next Steps (GPT-5 Recommended)

### Step 1: Unblock Codex Cloud (Optional)
**If you want to use Codex Cloud for interactive development:**

Add minimal root `package.json`:
```json
{
  "name": "lba-logger-monorepo",
  "private": true,
  "scripts": {
    "dev": "npm --prefix worker run dev",
    "build": "npm --prefix worker run build",
    "test": "npm --prefix worker test --if-present",
    "deploy": "npm --prefix worker run deploy"
  }
}
```

**Why**: Codex Cloud auto-discovery expects root `package.json`. This delegates to `worker/` without restructuring.

---

### Step 2: Implement Client Logger (M1)
**Time**: 4-6 hours
**Files**:
- `shared/error-logger.js` - Client library with fingerprinting
- `shared/sanitizer.js` - JavaScript duplicate of Worker rules
- `shared/__tests__/error-logger.test.js` - Unit tests
- `shared/__tests__/sanitizer-parity.test.js` - Parity tests
- `docs/README-logger.md` - Usage guide
- `docs/PII-POLICY.md` - Privacy guarantees
- `docs/ADR-LOGGER.md` - Architecture Decision Record

**Logger Exports**:
```javascript
export const ErrorLogger = {
  init,              // Initialize (service worker or window context)
  capture,           // Manual error capture
  setBreadcrumb,     // Track user actions
  setFeatureFlags,   // Track feature state (hashed)
  reportToGitHub     // User-triggered reporting
};
```

**Client Dedup**:
- In-memory TTL map (5-minute window, session-scoped)
- Persistent small LRU (cap ~100 entries, 7-day TTL)

**Send to Worker**:
- Include `clientFingerprint` + enriched metadata
- Worker recomputes `serverFingerprint` and logs both

---

### Step 3: Worker Enhancements
**Time**: 2-3 hours

**Durable Object Bucket** (`worker/src/do/issue-manager.ts`):
```typescript
interface DedupBucket {
  fingerprint: string;
  majorMinorVersion: string;
  surface: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  versions: string[];  // All versions that hit this fingerprint
}
```

**Issue Creator** (`worker/src/worker.ts`):
- Create issue on first occurrence
- Comment and relabel on thresholds (10, 50, 100 occurrences)
- Attach metadata JSON (fingerprints, versions, prevalence)

**Weekly Rollup** (Cloudflare cron):
- Top 10 fingerprints by volume
- Comment on existing issues with trends

---

### Step 4: Self-Healer Repo Setup (M3)
**Time**: 6-8 hours

**GitHub App**:
- Create app for repo access
- Store credentials in GitHub Actions secrets
- Webhook: `issues.labeled` event (label: `auto-triage`)

**Triage Workflow** (`.github/workflows/auto-triage.yml`):
1. Read labeled issue
2. Parse metadata (fingerprint, extension, version, surface)
3. Fetch code at commit SHA (from issue metadata)
4. Run test suite (confirm reproducible)
5. Invoke policy engine (safe vs critical)
6. If safe: Invoke AI agent (Anthropic or OpenAI API)
7. If critical: Label `needs-human-review`

**Dry-Run Mode**:
- Produce PR diff as GitHub Actions artifact
- NO auto-merge yet (manual review only)

---

### Step 5: Monitoring & Quality Gates
**Time**: 2-3 hours

**E2E Tests** (`e2e/logger-integration.spec.ts`):
- Induce known error in test extension
- Assert dedup behavior (duplicate blocked, regression allowed)
- Assert GitHub issue creation (fingerprint in metadata)

**Observability** (Cloudflare Worker analytics):
- Counters: received/accepted/suppressed events by reason
- Dashboard: Fingerprint volume trends, version distribution

---

## 💬 GPT-5 Optional Guidance

### Starter Prompt for Code Agent (When Ready)

**Objective**: Implement Phase 0 client error logger for NoteBridge using the provided docs. Do not modify server infra beyond adding fingerprint ingestion and dedup.

**Read Order**:
1. `docs/GPT5-EXPERT-VALIDATION-ADDENDUM.md`
2. `docs/PII-POLICY.md` (to be created)
3. `docs/README-logger.md` (to be created)

**Deliverables**:
- `shared/error-logger.js`, `shared/sanitizer.js`
- Worker changes: accept `clientFingerprint`, recompute `serverFingerprint`, Durable Object dedup, GitHub issue metadata update
- Tests: sanitizer parity fixture, dedup unit tests
- Summary: list of files changed, commands to run dev/test/deploy, known gaps

**Constraints**:
- No PII in logs; sanitize on client and server
- Dedup window: 7 days; version-aware keys
- ESM only; no build step in extensions

**Success Criteria**:
- Local E2E demo shows one issue created for repeated identical errors
- Subsequent events increment counters without new issues
- Sanitizer parity tests pass locally
- Lint/CI green

---

## 🎯 Final GPT-5 Take

**Your Strategic Calls Are Solid**:
- ✅ Don't build custom analytics (keep Plausible)
- ✅ Build self-healing loop separately
- ✅ Add fingerprinting now
- ✅ Implement client logger directly for speed

**Biggest Correction**:
- ❌ Do NOT rely on consumer subscriptions for automation (use APIs)

**Biggest Technical Nuance**:
- ✅ Compute fingerprint on BOTH sides (trust server, store both for debugging)
- ✅ Version-aware dedup to prevent masking regressions
- ✅ Avoid client secrets (use origin validation, rate limits, honeypot)

**GPT-5 Offer**:
> "If you want, I can review your planned fingerprint schema and sanitizer rules before you implement to catch edge cases like locale-specific messages, minified stack frames, and dynamic IDs embedded in messages."

---

## 📚 Updated Documentation Index

**New Documents Created**:
1. ✅ `docs/SELF-HEALING-LOOP-IMPLEMENTATION.md` - Original 26-hour plan
2. ✅ `docs/SELF-HEALING-LOOP-GPT5-UPDATES.md` - **This document** (GPT-5 corrections)
3. ✅ `docs/ANALYTICS-MODULE-INVESTIGATION.md` - Do NOT build analytics
4. ✅ `docs/ERROR-LOGGER-VS-SENTRY.md` - Why custom logger vs Sentry
5. ✅ `docs/ANALYTICS-VS-LOGGER-COMPLEXITY.md` - Why analytics costs 100x more

**Documents to Create** (Next):
1. `docs/README-logger.md` - Client library usage guide
2. `docs/PII-POLICY.md` - Privacy guarantees
3. `docs/ADR-LOGGER.md` - Architecture Decision Record
4. `docs/FINGERPRINTING-GUIDE.md` - How fingerprints work

---

## 🚀 Ready to Proceed?

**Next Decision Point**: Which milestone first?

**Option A**: M1 - Logger + Fingerprinting (4-6 hours)
- Gets NoteBridge pilot ready faster
- Client library complete
- Can start Week 1 monitoring

**Option B**: M3 - Self-Healer Skeleton (6-8 hours)
- Proves end-to-end automation feasibility
- Dry-run mode shows AI-proposed fixes
- Validates architecture before full build-out

**Recommended**: **Option A** (M1 first)
- Logger is immediate value (catch production errors now)
- Self-healer can wait (errors are being captured, just not auto-fixed)
- Incremental validation (prove logger works before building self-healer)

---

**🤖 GPT-5 Analysis Complete** - Ready for your decision!
