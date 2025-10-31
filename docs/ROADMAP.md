# Homeostat Roadmap

**Document Type**: Strategic Product Roadmap • **Audience**: Engineering, Product • **Status**: Living Document

**Last Updated**: 2025-10-31

---

## Vision

Transform Homeostat from a simple error-fixing tool into a **trusted, guarded automation layer** that converts runtime signals into small, auditable PRs—never mutating production directly, always explaining the "why" in human terms.

---

## Design Principles

1. **Microtool Philosophy**: Ship features in 2-4 week increments, 1-3 features per release
2. **Trust First**: Every change must be explainable, auditable, and reversible
3. **Safety by Design**: Guardrails, rate limits, and policy checks before action
4. **Cost Conscious**: Maintain ultra-low operating costs ($10-50/year target)
5. **Git as Database**: Leverage GitHub/Git as state store until scale demands otherwise
6. **Stay Small**: Only evolve to platform when clear demand signals emerge

---

## Current State (v1.0 - Production)

**Status**: ✅ Operational in production (Convert My File, deploying to NoteBridge/PaletteKit)

### Core Capabilities
- **CloakPipe Integration**: Automatic error capture → GitHub issue with `robot` label → Homeostat fix
- **Multi-Tier AI**: 3-tier routing (DeepSeek Tier 1/2, GPT-5 Tier 3) for cost optimization
- **Privacy-First**: PII sanitization (50+ patterns, 98.2% coverage), sensitive file detection
- **Test Gating**: Only creates PR if test suite passes
- **Circuit Breaker**: Hop-count labels (hop:0-3) prevent infinite loops
- **Budget & Rate Limiting**: Per-repo caps ($0.066/day), dual-window rate limiting (5/min burst, 20/day throughput)
- **Self-Healing Pattern Library**: Feature-flagged learning from successful fixes (zero-cost replay at 80% confidence)
- **Dual Parser**: Routes extension vs server error formats via source labels

### Metrics (Projected)
- **Cost**: $5.77-$6.99/year for 1,000 fixes (38% under $9.28 target)
- **Test Coverage**: 230/230 tests passing (97.9%-100% coverage on critical modules)
- **Success Criteria**: All Phase 0-1 + P1-P6 complete

### Deployed Repositories
- ✅ Convert My File (Phase 2 complete)
- ⏳ NoteBridge (Phase 3 pending)
- ⏳ PaletteKit (Phase 3 pending)

---

## Version Roadmap

### v2.0 - Trust & Safety (2 Weeks) 🎯 **NEXT RELEASE**

**Theme**: Build maintainer trust through transparency and guardrails

**Target Date**: 2025-11-14

#### Core Features (Ship)

##### 1. Evidence-First PRs ("Proof Packs v1")
**ROI**: ⭐⭐⭐⭐⭐ High • **Usefulness**: 9/10 • **Timeline**: 1 day

**Description**: Every PR includes structured evidence explaining "what, why, how verified"

**Implementation**:
- PR body template with sections:
  - **Triggering Event**: Error fingerprint, occurrences, severity, telemetry snippet (sanitized)
  - **Hypothesis**: Plain-English explanation of root cause and fix approach
  - **Changes**: File list with line counts, summary of modifications
  - **Verification**: Test results, guardrails passed, tier used
  - **Before/After**: Sanitized telemetry comparison when available
- Populate dynamically from workflow context
- Ensure PII sanitization for all telemetry snippets

**Acceptance Criteria**:
- [ ] PR template scaffolding in place
- [ ] Telemetry snippets sanitized with existing PII engine
- [ ] Hypothesis generation from LLM rationale
- [ ] Test results and guardrails summary included
- [ ] Dogfooded on NoteBridge/PaletteKit

**Files Changed**:
- `homeostat/execution/proof-pack-builder.js` (new)
- `homeostat/execution/tier*-fix.js` (integrate proof pack)
- `.github/workflows/fix-error.yml` (populate PR body)

---

##### 2. Advanced Guardrails
**ROI**: ⭐⭐⭐⭐⭐ High • **Usefulness**: 9/10 • **Timeline**: 1 day

**Description**: File allowlists, semantic caps, and policy pre-checks to reduce blast radius

**Implementation**:
- Per-repo configuration file: `.homeostat/config.json`
  ```json
  {
    "guardrails": {
      "allowedPaths": ["src/**", "tests/**", "lib/**"],
      "blockedPaths": ["config/secrets/**", ".env*", "database/migrations/**"],
      "maxLinesChanged": 50,
      "maxFilesChanged": 3,
      "requireGatekeeperApproval": true
    }
  }
  ```
- Pre-flight validation before generating fix
- Integration with Gatekeeper for policy checks
- Clear error messages when blocked: "⚠️ Fix blocked by guardrail: exceeds max LOC (75 > 50)"
- Option for per-repo override via `allow-override` label (manual)

**Acceptance Criteria**:
- [ ] Config parser with schema validation
- [ ] Pre-flight checks before tier execution
- [ ] Gatekeeper integration (policy pre-check)
- [ ] Blocked fix comments on issue with clear rationale
- [ ] Default config for new repos (conservative limits)

**Files Changed**:
- `homeostat/guardrails/config-loader.js` (new)
- `homeostat/guardrails/validator.js` (new)
- `homeostat/guardrails/gatekeeper-client.js` (new)
- `homeostat/orchestrator.js` (integrate guardrails)
- `.github/workflows/fix-error.yml` (add guardrail step)

---

##### 3. CI Failing Checks as Triggers
**ROI**: ⭐⭐⭐⭐⭐ High • **Usefulness**: 8/10 • **Timeline**: 1 day

**Description**: Expand trigger surface from CloakPipe errors to CI failures (flaky tests, type errors, lints)

**Implementation**:
- Webhook triggers: `check_run.completed`, `status.completed`
- Dedupe key: `${repo}:${check_name}:${sha}`
- Filter: Only trigger if conclusion is `failure` and check is not `homeostat` (prevent loops)
- Respect existing rate limits (5/min burst, 20/day per repo)
- Jittered scheduling to avoid thundering herds
- Create GitHub issue automatically with check failure details, add `robot` label

**Acceptance Criteria**:
- [ ] Workflow triggers on check_run/status events
- [ ] Dedupe logic prevents duplicate fixes for same failure
- [ ] Rate limits enforced (reuse existing budget/rate limiter)
- [ ] Auto-issue creation with check failure context
- [ ] Loop prevention (don't trigger on homeostat's own checks)

**Files Changed**:
- `.github/workflows/fix-error.yml` (add check_run/status triggers)
- `homeostat/triggers/ci-check-handler.js` (new)
- `homeostat/triggers/dedupe-store.js` (new)
- `homeostat/triggers/issue-creator.js` (new)

---

##### 4. SLOs & Metrics Logging (Bonus)
**ROI**: ⭐⭐⭐⭐⭐ High • **Usefulness**: 8/10 • **Timeline**: 0.5 day

**Description**: Emit structured telemetry for accountability and continuous improvement

**Implementation**:
- Emit JSONL events: `alert_received`, `fix_started`, `pr_opened`, `pr_merged`, `pr_closed_unmerged`, `circuit_breaker_triggered`
- Store in `.homeostat/telemetry/YYYY-MM-DD.jsonl` (git-tracked, one file per day)
- Daily aggregation script: `npm run metrics:report`
  - Outputs: P95 Alert-to-PR latency, Acceptance rate (30d), Rollback rate (7d)
- README badge: `![Homeostat Success Rate](https://img.shields.io/badge/homeostat-82%25%20accepted-green)`
- Weekly summary comment on tracking issue

**Acceptance Criteria**:
- [ ] Event emitter integrated into workflow steps
- [ ] JSONL storage with daily rotation
- [ ] Aggregation script with P95, acceptance, rollback calculations
- [ ] README badge generation
- [ ] Privacy: No PII in telemetry events

**Files Changed**:
- `homeostat/telemetry/event-emitter.js` (new)
- `homeostat/telemetry/aggregator.js` (new)
- `scripts/metrics-report.sh` (new)
- `.github/workflows/fix-error.yml` (emit events at each step)
- `README.md` (add metrics badge)

---

#### Success Criteria (v2.0)
- [ ] All 4 features deployed to production
- [ ] Acceptance rate ≥80% on NoteBridge/PaletteKit (30 days post-deployment)
- [ ] Zero PII leaks in proof packs (validated with 50+ corpus)
- [ ] Zero guardrail bypasses (all blocks logged and respected)
- [ ] P95 Alert-to-PR latency <15 min
- [ ] Cost remains <$10/year for 1,000 fixes

---

### v2.1 - Verification & Counterfactuals (1-2 Weeks)

**Theme**: Improve fix quality through adversarial review and before/after testing

**Target Date**: 2025-11-28

#### Features (Go-Limited)

##### 5. Counterfactual Testing (Lite)
**ROI**: ⭐⭐⭐⭐ High • **Usefulness**: 8/10 (with failing tests), 4/10 (without) • **Timeline**: 1-2 days

**Description**: Reproduce failing test before fix, rerun after fix, show delta in proof pack

**Implementation**:
- Only activate when CI has a failing test (detected via check_run or status API)
- Checkout failing SHA in ephemeral environment
- Run failing test(s), capture output/logs
- Apply Homeostat patch
- Rerun test(s), capture output/logs
- Compare before/after, include in proof pack
- Skip if no failing test available (note in PR: "Counterfactual unavailable - no failing test")

**Scope Limits** (Defer to v3):
- Don't auto-generate new tests
- Don't capture full environment snapshots
- Don't support non-deterministic tests (flag as "flaky suspicion" if reproduce fails twice)

**Acceptance Criteria**:
- [ ] Detect failing tests from check_run API
- [ ] Checkout and run tests at failing SHA
- [ ] Apply patch and rerun tests
- [ ] Include before/after comparison in proof pack
- [ ] Handle timeouts (max 5 min per test run)
- [ ] Flag flaky tests if results inconsistent

**Files Changed**:
- `homeostat/verification/counterfactual-runner.js` (new)
- `homeostat/verification/test-executor.js` (new)
- `.github/workflows/fix-error.yml` (add counterfactual step)
- `homeostat/execution/proof-pack-builder.js` (include counterfactual results)

---

##### 6. Dual-Model Self-Review (Same Model)
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 6/10 • **Timeline**: 1 day

**Description**: Adversarial prompt pass to critique patch before opening PR

**Implementation**:
- After tier fix generates patch, run second prompt with same LLM
- Adversarial prompt: "You are a critical code reviewer. Your job is to find problems with this patch. List specific concerns (security, correctness, performance, edge cases). If patch is sound, respond 'APPROVED'. If concerns exist, respond 'REJECTED: <reasons>'."
- If response contains "REJECTED", block PR and comment on issue
- Log all reviews (approved and rejected) in `.homeostat/reviews/`
- Include review outcome in proof pack
- Token cost: ~2x per fix (acceptable given low base cost)

**Scope Limits** (Defer to v3):
- Use same model (Tier 1 → DeepSeek reviews DeepSeek, Tier 3 → GPT-5 reviews GPT-5)
- Don't split into separate services
- Don't use different model families (avoid cost/latency spike)

**Acceptance Criteria**:
- [ ] Adversarial prompt template
- [ ] Review pass after patch generation
- [ ] Block logic on REJECTED
- [ ] Comment on issue with rejection rationale
- [ ] Log all reviews for analysis
- [ ] Include in proof pack

**Files Changed**:
- `homeostat/verification/self-reviewer.js` (new)
- `homeostat/execution/tier*-fix.js` (integrate self-review)
- `.github/workflows/fix-error.yml` (add review step)

---

##### 7. Safe Dependency Patch Bumps
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 7/10 • **Timeline**: 1-2 days

**Description**: Auto-merge low-risk dependency patch bumps with changelog validation

**Implementation**:
- Trigger: Dependabot/Renovate PR with patch-level bump (e.g., `1.2.3` → `1.2.4`)
- Fetch changelog between versions
- Scan for keywords: "BREAKING", "breaking change", "security", "deprecated", "removal", "incompatible"
- If keywords found, add comment and skip auto-merge
- If clean, run full test suite
- Auto-merge only if: tests pass + no breaking keywords + patch-level only + guardrails pass
- Rate limit: Max 5 dependency PRs per day per repo

**Scope Limits** (Defer to v3):
- Patch-level only (no minor/major bumps)
- Single dependency at a time (no batch updates)
- Node/JS/npm only (defer Python, Ruby, etc.)

**Acceptance Criteria**:
- [ ] Detect Dependabot/Renovate PRs
- [ ] Parse semver to confirm patch-level
- [ ] Fetch and scan changelog
- [ ] Keyword blocklist validation
- [ ] Test suite execution
- [ ] Auto-merge logic with all conditions
- [ ] Rate limiting (5/day per repo)

**Files Changed**:
- `homeostat/triggers/dependency-handler.js` (new)
- `homeostat/verification/changelog-scanner.js` (new)
- `.github/workflows/dependency-automerge.yml` (new workflow)

---

#### Success Criteria (v2.1)
- [ ] Counterfactual testing working for 80% of CI-triggered fixes
- [ ] Self-review rejection rate <20% (avoid false positives)
- [ ] Dependency automerge working for patch bumps, zero breaking changes merged
- [ ] Cost increase <50% vs v2.0 (self-review doubles tokens but still cheap)

---

### v2.2 - Operational Excellence (1 Week)

**Theme**: Production hardening and security baseline

**Target Date**: 2025-12-05

#### Features

##### 8. Least-Privilege & Audit Logs
**ROI**: ⭐⭐⭐⭐ Medium-High • **Usefulness**: 6/10 • **Timeline**: 0.5 day

**Description**: Tighten GitHub token scopes and log all actions for compliance

**Implementation**:
- Audit current GitHub PAT scopes, reduce to minimum required:
  - `repo` (read/write code)
  - `issues` (read/write issues)
  - `pull_requests` (create PRs)
  - Remove: `admin:org`, `workflow`, `packages`
- Structured audit log: `.homeostat/audit/YYYY-MM-DD.jsonl`
  - Events: `token_used`, `file_read`, `file_write`, `pr_created`, `issue_commented`, `policy_checked`
  - Fields: `timestamp`, `actor`, `action`, `resource`, `outcome`, `ip_address` (if available)
- Weekly audit report script: `npm run audit:report`
- Archive logs monthly (compress to `.gz`, store in git)

**Acceptance Criteria**:
- [ ] Token scopes reduced and validated
- [ ] Audit log emitter integrated
- [ ] Weekly report script
- [ ] Monthly log archival automation
- [ ] Privacy: Redact PII from logs

**Files Changed**:
- `homeostat/security/audit-logger.js` (new)
- `scripts/audit-report.sh` (new)
- `scripts/archive-logs.sh` (new)
- `.github/workflows/fix-error.yml` (emit audit events)

---

##### 9. GitHub App Commit Signing (Optional)
**ROI**: ⭐⭐ Medium (if easy), Low (if complex) • **Usefulness**: 5/10 • **Timeline**: 0.5-1 day

**Description**: Sign commits with GitHub App identity for "Verified" badge

**Implementation**:
- Use GitHub App authentication instead of PAT (if feasible)
- Configure app to sign commits automatically
- "Verified" badge appears on Homeostat commits
- If complex or requires GitHub App migration, **defer to v3**

**Decision Point**: Evaluate complexity during sprint planning. If >1 day effort, defer.

**Acceptance Criteria** (If Go):
- [ ] GitHub App authentication configured
- [ ] Commits show "Verified" badge
- [ ] Documentation updated with app setup instructions

**Files Changed**:
- `.github/workflows/fix-error.yml` (GitHub App token)
- `docs/DEPLOYMENT.md` (GitHub App setup guide)

---

##### 10. Dry-Run Mode
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 7/10 • **Timeline**: 0.5 day

**Description**: Allow repos to test Homeostat without opening PRs

**Implementation**:
- Per-repo config flag: `"dryRun": true` in `.homeostat/config.json`
- If enabled, run full pipeline but:
  - Don't create PR
  - Don't push branch
  - Comment on issue with "would have created PR" summary and diff link
- Useful for new repos to test before full automation

**Acceptance Criteria**:
- [ ] Dry-run flag in config schema
- [ ] Skip PR creation when enabled
- [ ] Comment on issue with full proof pack and diff
- [ ] Emit telemetry event: `dry_run_completed`

**Files Changed**:
- `homeostat/guardrails/config-loader.js` (add dryRun field)
- `.github/workflows/fix-error.yml` (conditional PR creation)

---

##### 11. Canary Deployment System
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 6/10 • **Timeline**: 2-3 days

**Description**: Gradual rollout of fixes with automatic rollback on error rate spike

**Implementation**:
- **Stage definitions**: 1%, 5%, 25%, 100% user rollout
- **Chrome Extension distribution**: Update `manifest.json` with canary version flag, distribute to user subset
- **Error rate monitoring**: Query analytics, compare canary vs stable error rates
- **Auto-rollback**: Revert if canary errors >150% of stable baseline
- **Staged progression**: Only advance to next stage if current stage passes duration threshold

**Stage Configuration**:
```javascript
const CANARY_STAGES = [
  { percentage: 1, duration: '2h', maxErrorIncrease: 1.5 },
  { percentage: 5, duration: '6h', maxErrorIncrease: 1.3 },
  { percentage: 25, duration: '24h', maxErrorIncrease: 1.2 },
  { percentage: 100, duration: 'stable' }
];
```

**Acceptance Criteria**:
- [ ] Canary percentage distribution logic
- [ ] Real-time error rate monitoring
- [ ] Automatic rollback on threshold breach
- [ ] Stage progression tracking
- [ ] Notification on rollback

**Files Changed**:
- `homeostat/deployment/canary.js` (activate existing stub)
- `homeostat/deployment/chrome-distribution.js` (new)
- `homeostat/deployment/error-monitor.js` (new)
- `homeostat/deployment/rollback.js` (new)

---

##### 12. Slack/Teams Integration
**ROI**: ⭐⭐ Low-Medium • **Usefulness**: 5/10 • **Timeline**: 0.5-1 day

**Description**: Real-time notifications for fix events

**Implementation**:
- Webhook notifications on: fix success, fix failure, cost threshold exceeded, circuit breaker triggered
- Configurable notification levels (critical, warning, info)
- Rate limiting (max 10 notifications/hour)
- 24h deduplication (same issue, multiple failures)

**Notification Types**:
```javascript
{
  fixSuccess: '✅ Issue #123 fixed via Tier 2 (PR: <url>)',
  fixFailure: '⚠️ Issue #123 fix failed: empty patch',
  budgetExceeded: '💸 Repo budget exceeded: $0.08/$0.066 daily cap',
  circuitBreaker: '🔌 Circuit breaker triggered: hop:3 on Issue #456'
}
```

**Acceptance Criteria**:
- [ ] Webhook integration (Slack/Teams/Discord)
- [ ] Notification templates
- [ ] Rate limiting and deduplication
- [ ] Configurable notification levels
- [ ] Test mode (dry-run notifications)

**Files Changed**:
- `homeostat/notifications/slack.js` (new)
- `homeostat/notifications/teams.js` (new)
- `.github/workflows/fix-error.yml` (emit notifications)

---

##### 13. Metrics Dashboard (Static)
**ROI**: ⭐⭐ Low • **Usefulness**: 6/10 • **Timeline**: 1-2 days

**Description**: Visual dashboard showing trends and performance metrics

**Implementation**:
- **Data aggregation**: Parse telemetry JSONL, compute weekly/monthly aggregates
- **Static HTML dashboard**: Chart.js for visualizations (success rate, cost breakdown, tier distribution)
- **Hosted on GitHub Pages**: Auto-update via weekly cron
- **Charts**:
  - Success rate trend (weekly)
  - Cost breakdown by tier (monthly)
  - Tier distribution (pie chart)
  - P95 latency trend
  - Pattern library hit rate (if enabled)

**Dashboard Sections**:
```html
1. Overview (current month stats)
2. Success Rate Trends (line chart, 12 weeks)
3. Cost Analysis (stacked bar, per tier)
4. Tier Distribution (pie chart)
5. Latency Metrics (P95 line chart)
6. Top Issues (table, most fixed errors)
```

**Acceptance Criteria**:
- [ ] Data aggregation script
- [ ] Static HTML dashboard with Chart.js
- [ ] GitHub Pages deployment
- [ ] Weekly auto-update workflow
- [ ] Responsive design (mobile-friendly)

**Files Changed**:
- `scripts/aggregate-metrics.js` (new)
- `dashboard/index.html` (new)
- `dashboard/metrics.json` (generated)
- `.github/workflows/update-dashboard.yml` (new)

---

#### Success Criteria (v2.2)
- [ ] Zero token scope violations
- [ ] Audit logs capturing 100% of actions
- [ ] Dry-run mode tested on 2+ new repos
- [ ] GitHub App signing working (if implemented)

---

### v2.x Maintenance & Monitoring (Ongoing)

**Theme**: Learn from production usage, tune thresholds, accumulate patterns

#### Continuous Activities
- Monitor first 10 fixes on each repo (deep analysis per docs/REMAINING-TASKS.md)
- Track tier distribution (target: 60-80% Tier 1, 20-40% Tier 2, 0-20% Tier 3)
- Adjust complexity thresholds if skew occurs
- Pattern library growth tracking (self-healing confidence scores)
- Cost tracking per repo (alert if exceeds $0.066/day)
- Acceptance rate monitoring (target ≥80%)
- Circuit breaker analysis (hop count distribution, identify hot-loop repos)

#### Threshold Tuning (As Needed)
- Complexity analyzer thresholds (docs/REMAINING-TASKS.md Task 2.7)
- Budget caps per repo (adjust if usage patterns change)
- Rate limit windows (if burst/throughput insufficient)
- Guardrails defaults (if too restrictive or too permissive)

---

## v3.0 - Intelligence & Scale (4-6 Weeks)

**Theme**: Smarter fixes, expanded scope, design partner readiness

**Target Date**: 2026-01-15

**Trigger Condition**: One of:
- Supporting >10 active repos, OR
- >100 successful fixes/month, OR
- Design partner requires attestations/enhanced features

### Features

##### 11. Multi-Model Planner/Verifier (Separate Models)
**ROI**: ⭐⭐⭐⭐ Medium-High • **Usefulness**: 7/10 • **Timeline**: 2-3 days

**Description**: Use different model for verification to reduce rubber-stamping

**Implementation**:
- Planner: Use existing tier model (DeepSeek or GPT-5)
- Verifier: Use different model (e.g., Claude Sonnet, GPT-4o, or Gemini)
- Verifier must explicitly approve patch
- Log disagreements and resolution
- Include both model outputs in proof pack
- Token cost: +50% vs same-model review (acceptable if scale justifies it)

**Acceptance Criteria**:
- [ ] Multi-model configuration (planner + verifier per tier)
- [ ] Verifier approval logic
- [ ] Disagreement logging and resolution
- [ ] Cost tracking for dual-model approach

**Files Changed**:
- `homeostat/verification/multi-model-reviewer.js` (new)
- `homeostat/execution/tier*-fix.js` (integrate multi-model review)

---

##### 12. Expanded Fix Classes (Medium Risk)
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 6/10 • **Timeline**: 3-5 days

**Description**: Support minor dependency bumps, SDK adapter changes (feature-flagged)

**Implementation**:
- **Minor Dependency Bumps** (e.g., `1.2.3` → `1.3.0`):
  - Require: Changelog scan + counterfactual testing + guardrails + test suite green
  - Flag behind per-repo config: `"allowMinorBumps": true`
- **SDK Adapter Changes** (e.g., deprecated API migration):
  - Detect deprecation warnings in logs/telemetry
  - Generate adapter shim with feature flag
  - Require: Counterfactual + full test suite + manual review (no auto-merge)
  - Flag behind per-repo config: `"allowAdapterChanges": true`

**Scope Limits**:
- No major version bumps (defer to v4+)
- No schema migrations (defer to v4+)
- No security-critical core logic rewrites

**Acceptance Criteria**:
- [ ] Minor bump support with enhanced validation
- [ ] SDK adapter detection and migration
- [ ] Feature flags per repo
- [ ] No auto-merge for adapter changes (draft PR only)

**Files Changed**:
- `homeostat/triggers/dependency-handler.js` (expand to minor)
- `homeostat/detection/deprecation-scanner.js` (new)
- `homeostat/generation/adapter-generator.js` (new)

---

##### 13. Additional CloakPipe Signals
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 6/10 • **Timeline**: 2-3 days per signal type

**Description**: Expand beyond errors to latency spikes, error clusters, cost anomalies

**Implementation Priority**:
1. **Error Clusters** (High Value): Group similar errors, fix root cause once
   - Cluster by fingerprint + stack trace similarity
   - Create single issue for cluster (not one per occurrence)
   - Attach aggregate telemetry (frequency, affected users)
2. **Latency Spikes** (Medium Value): Suggest timeout/backoff/cache changes
   - Detect P99 latency increase vs baseline
   - Propose config tweaks (connection timeout, retry backoff, cache TTL)
   - Require before/after telemetry in proof pack
3. **Cost Anomalies** (Low Value - Defer): Query optimization suggestions
   - Detect expensive DB queries or API calls
   - Suggest indexes, query rewrites, caching
   - High complexity, defer to v3.1+

**Acceptance Criteria** (Error Clusters + Latency):
- [ ] CloakPipe signal types extended
- [ ] Clustering algorithm for errors
- [ ] Latency baseline detection
- [ ] Config change generation for performance
- [ ] Telemetry before/after in proof pack

**Files Changed**:
- `homeostat/triggers/cloakpipe-handler.js` (expand signal types)
- `homeostat/analysis/error-clusterer.js` (new)
- `homeostat/analysis/latency-analyzer.js` (new)
- `homeostat/generation/config-tuner.js` (new)

---

##### 14. Human-in-the-Loop Labeling
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 6/10 • **Timeline**: 2-3 days

**Description**: Allow maintainers to request fix types via labels

**Implementation**:
- Label system:
  - `homeostat:flaky-test` → Focus on test stabilization
  - `homeostat:performance` → Focus on latency/throughput
  - `homeostat:type-fix` → Focus on type errors
  - `homeostat:dependency-bump` → Focus on outdated deps
- Parse labels in workflow trigger
- Pass to complexity analyzer as hint (influences tier selection)
- Track label → outcome correlation for future learning

**Acceptance Criteria**:
- [ ] Label detection in workflow
- [ ] Labels influence complexity analysis
- [ ] Tracking for label effectiveness
- [ ] Documentation for maintainers

**Files Changed**:
- `.github/workflows/fix-error.yml` (parse labels)
- `homeostat/routing/complexity-analyzer.js` (use label hints)
- `homeostat/telemetry/label-tracker.js` (new)

---

##### 15. Cross-Repository Pattern Sharing
**ROI**: ⭐⭐⭐⭐ High • **Usefulness**: 8/10 • **Timeline**: 3-4 days

**Description**: Share successful patterns across repos to improve fix quality

**Implementation**:
- Central pattern library: Homeostat repo `.patterns/` directory
- Each successful fix extracts:
  - Error fingerprint pattern
  - Fix template (generalized patch)
  - Confidence score (based on merge + no rollback)
- When new error matches known pattern (>80% confidence), apply template first
- If template fix passes tests, skip LLM call entirely (zero cost!)
- If template fails, fall back to normal tier routing
- Periodically sync patterns across repos (weekly cron)

**Acceptance Criteria**:
- [ ] Central pattern library structure
- [ ] Pattern extraction from successful fixes
- [ ] Template matching algorithm (fuzzy match on fingerprint)
- [ ] Zero-cost fast path for high-confidence patterns
- [ ] Weekly pattern sync across repos

**Files Changed**:
- `homeostat/patterns/library-manager.js` (new)
- `homeostat/patterns/template-matcher.js` (new)
- `homeostat/patterns/extractor.js` (new)
- `homeostat/orchestrator.js` (pattern fast path)
- `.github/workflows/sync-patterns.yml` (new cron workflow)

---

#### Success Criteria (v3.0)
- [ ] Multi-model verification reduces false positives by ≥30% vs v2.1
- [ ] Error clustering reduces duplicate fixes by ≥50%
- [ ] Pattern library achieves ≥20% zero-cost fix rate
- [ ] Latency fixes demonstrate measurable P99 improvement
- [ ] Design partner onboarded with enhanced features

---

## v3.x - Enterprise Readiness (As Needed)

**Theme**: Compliance, attestations, and design partner features

**Trigger Condition**: Design partner requires SOC2-aligned evidence or formal attestations

### Features (On-Demand)

##### 16. Signed Commits & Attestations (in-toto, SLSA)
**ROI**: ⭐⭐ Medium • **Usefulness**: 6/10 • **Timeline**: 3-5 days

**Description**: Cryptographic proof of CI execution and artifact integrity

**Implementation**:
- **Option A**: Sigstore gitsign (keyless signing)
  - GitHub Actions OIDC token → Sigstore Fulcio → Transparency log
  - All commits signed automatically
  - Verifiable via `gitsign verify`
- **Option B**: in-toto attestations
  - Attest to workflow inputs, steps, outputs
  - Store attestations in repo or OCI registry
  - Verifiable via `in-toto-verify`
- **Option C**: SLSA Build Level 2+
  - GitHub's SLSA generator action
  - Provenance for all artifacts (patches, PRs)

**Decision Point**: Choose based on design partner requirements

**Acceptance Criteria**:
- [ ] All commits signed and verifiable
- [ ] Attestations generated for each fix
- [ ] Documentation for verification process
- [ ] Audit trail includes signature metadata

---

##### 17. Service Architecture (If Scale Demands)
**ROI**: ⭐⭐ Low-Medium • **Usefulness**: 5/10 • **Timeline**: 2-4 weeks

**Description**: Split into Planner/Verifier/Executor services with queues and DB

**Implementation**:
- **Planner Service**: Receives events, generates patches, queues for verification
- **Verifier Service**: Reviews patches, approves/rejects, queues for execution
- **Executor Service**: Runs tests, creates PRs, updates state
- **Infrastructure**:
  - Object storage: Artifacts (patches, logs, telemetry)
  - Postgres: Runs, state, metrics
  - Queue: Redis or SQS for job dispatch
  - Observability: Datadog, Sentry, or similar

**Scope Limits**:
- Only implement if supporting >10 repos with high concurrency (>50 fixes/day)
- Otherwise, GitHub Actions + Git state is sufficient

---

##### 18. Custom Fix Classes (Enterprise Add-On)
**ROI**: ⭐⭐⭐ Medium • **Usefulness**: 7/10 • **Timeline**: Varies per class

**Description**: Allow design partners to define custom fix types

**Implementation**:
- Plugin system for fix classes
- Schema: `{ pattern, generator, tests, guardrails }`
- Example: "React Hook dependencies" fix class
  - Pattern: ESLint warning `react-hooks/exhaustive-deps`
  - Generator: Add missing dependencies to deps array
  - Tests: Verify no infinite re-renders
  - Guardrails: Max 5 deps added per fix

**Acceptance Criteria**:
- [ ] Plugin API defined
- [ ] 1-2 custom classes implemented as examples
- [ ] Documentation for creating custom classes

---

## v4.0+ - Platform Vision (Future)

**Theme**: Homeostat as a platform for code health automation

**Trigger Condition**: >25 active repos, >500 fixes/month, multiple enterprise customers

### Potential Features (Exploratory)
- Schema migration support (high-risk, requires advanced verification)
- Multi-language support beyond Node/Python (Rust, Go, Java, etc.)
- Proactive scanning (don't wait for errors, scan repos for tech debt)
- Integration marketplace (3rd party fix classes, verifiers, signal sources)
- Multi-tenant SaaS offering (public or private cloud)
- Advanced ML: Train custom models on org's fix history
- Mobile app: On-call engineers approve fixes via mobile
- Slack/Teams bot: Interactive approval flow

---

## Phase Gating Criteria

### When to Advance from v2.x → v3.0
- [ ] Supporting ≥10 active repos, OR
- [ ] ≥100 successful fixes/month, OR
- [ ] Design partner requires v3 features (attestations, multi-model, expanded classes), OR
- [ ] Acceptance rate plateaus below 80% (need smarter fixes)

### When to Advance from v3.x → v4.0
- [ ] Supporting ≥25 active repos
- [ ] ≥500 fixes/month
- [ ] Multiple paying enterprise customers
- [ ] Evidence of demand for platform features (plugin requests, API access, etc.)

### When to Stay in Current Phase
- Cost remains <$50/year per repo
- Acceptance rate ≥80%
- No design partner pressure
- Maintainer feedback is positive
- Core use case (error fixing) is well-served

---

## Cost Evolution

| Version | Projected Annual Cost (1,000 fixes) | Notes |
|---------|-------------------------------------|-------|
| v1.0    | $5.77 - $6.99                       | Current production |
| v2.0    | $6-8                                | Proof packs add minimal tokens |
| v2.1    | $9-12                               | Self-review doubles tokens |
| v3.0    | $12-18                              | Multi-model, expanded signals |
| v4.0+   | $20-50                              | Platform overhead, ML training |

**Target**: Stay below $50/year per repo through v3.x

---

## Metrics & Success Criteria

### Key Metrics (Track Continuously)
- **Acceptance Rate**: % of PRs merged within 7 days (target: ≥80%)
- **Rollback Rate**: % of merged PRs reverted within 7 days (target: <1%)
- **Alert-to-PR Latency**: P95 time from alert to PR creation (target: <15 min)
- **Cost per Fix**: Average API cost per fix (target: <$0.02)
- **Pattern Library Hit Rate**: % of fixes resolved via templates (target: 20% by v3.0)
- **Circuit Breaker Triggers**: Frequency of hop:3+ (lower is better)
- **Guardrail Blocks**: % of fixes blocked by guardrails (target: 5-10% healthy)

### Release Quality Gates
Each version must meet:
- [ ] All acceptance criteria for shipped features
- [ ] Test coverage ≥95% on new modules
- [ ] Zero high-severity security vulnerabilities
- [ ] Cost per fix within target range
- [ ] Documentation complete (README, CLAUDE.md, DEPLOYMENT.md updated)
- [ ] Dogfooded on ≥2 repos for ≥1 week before wider rollout

---

## Open Questions & Research

### Before v2.1
- [ ] Optimal flaky test detection heuristic (2 runs sufficient? 3 runs?)
- [ ] Best practice for changelog scanning (keyword list complete?)

### Before v3.0
- [ ] Multi-model verifier effectiveness: Does it materially reduce false positives?
- [ ] Pattern library generalization: How to template fixes across different code styles?
- [ ] Error clustering algorithm: Levenshtein distance threshold for stack traces?

### Before v4.0
- [ ] Multi-tenant architecture: Per-tenant isolation vs shared infrastructure?
- [ ] Custom ML model ROI: Cost/benefit vs off-the-shelf LLMs?
- [ ] SaaS pricing: Per-repo, per-fix, or tiered plans?

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **PR spam from over-triggering** | Medium | High | Rate limits, dedupe, jittered scheduling, circuit breaker |
| **Cost blowup from dual-model** | Low | Medium | Budget caps per repo, monitoring, alerts |
| **Pattern library false positives** | Medium | Medium | Confidence threshold ≥80%, fallback to LLM, rollback on failure |
| **Guardrails too restrictive** | Medium | Low | Per-repo overrides, dry-run mode, feedback loop |
| **PII leaks in proof packs** | Low | High | Existing sanitization (98%+), manual review of proof packs, privacy tests |
| **Enterprise demands platform early** | Low | Medium | Clear roadmap communication, phased approach, design partner feedback |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-31 | Stay microtool through v3.x | Solo founder, 3 repos, $9/year cost is feature |
| 2025-10-31 | Prioritize trust (proof packs) over complexity (service split) | Adoption barrier is trust, not scale |
| 2025-10-31 | Use same model for self-review in v2.1, multi-model in v3.0 | Validate concept before cost increase |
| 2025-10-31 | Defer attestations until design partner requires | High complexity, low immediate value |
| 2025-10-31 | Pattern library enabled in v1.0 production | Zero-cost wins, learns from day 1 |

---

## References

- **Current Architecture**: `docs/DEEPSEEK-MULTI-AI-ARCHITECTURE.md`
- **Privacy & Security**: `docs/PRIVACY-SECURITY-GUIDE.md`
- **CloakPipe Integration**: `docs/CLOAKPIPE-INTEGRATION.md`
- **API Management**: `docs/API-MANAGEMENT-PLAN.md`
- **Deployment Tasks**: `docs/REMAINING-TASKS.md`
- **GPT-5 Vision Document**: `docs/ideas/homeostat.md`

---

**Document Owner**: Nathan Schram
**Last Review**: 2025-10-31
**Next Review**: 2025-12-01 (after v2.0 ships)
