# Codex Session 2: Integration & Observability

**Estimated Duration**: 2-4 hours
**Objective**: Add enhanced observability, complete E2E integration testing, and finalize high-priority enhancements
**Branch**: `feature/high-priority-enhancements` (continue from Session 1)

---

## Prerequisites

**Before starting**:
- ✅ Session 1 complete (multi-repo support + self-healing loop infrastructure)
- ✅ Feature branch `feature/high-priority-enhancements` exists
- ✅ All Session 1 tests passing (193 + new tests)
- ✅ Session 1 completion report reviewed

**Validation Commands**:
```bash
cd /Users/nathanschram/claude-code-tools/lba/tools/homeostat/main
git checkout feature/high-priority-enhancements
git pull origin feature/high-priority-enhancements
npm test  # Should pass
npm run build  # Should succeed
```

---

## Step 1: Enhanced Observability (2-3 hours)

### Problem Statement
Headless code change systems can fail silently or spam PRs. A slim, must-have telemetry baseline is needed before scaling to multi-repo production.

### Implementation Tasks

#### Task 1.1: Enhanced GitHub Actions Summary

**File**: `.github/workflows/multi-repo-orchestrator.yml` (modify)

**Add after the "Run Homeostat" step**:

```yaml
- name: Generate Detailed Summary
  if: always()
  run: |
    cat > $GITHUB_STEP_SUMMARY << 'EOF'
    ## 🤖 Homeostat Multi-Repo Run

    **Timestamp**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

    | Repository | Issues Processed | PRs Created | PRs Updated | Cooldowns | Cost | Tokens |
    |------------|------------------|-------------|-------------|-----------|------|--------|
    | convert-my-file | ${{ steps.cmf.outputs.processed }} | ${{ steps.cmf.outputs.created }} | ${{ steps.cmf.outputs.updated }} | ${{ steps.cmf.outputs.cooldown }} | \$${{ steps.cmf.outputs.cost }} | ${{ steps.cmf.outputs.tokens }} |
    | notebridge | ${{ steps.nb.outputs.processed }} | ${{ steps.nb.outputs.created }} | ${{ steps.nb.outputs.updated }} | ${{ steps.nb.outputs.cooldown }} | \$${{ steps.nb.outputs.cost }} | ${{ steps.nb.outputs.tokens }} |
    | palette-kit | ${{ steps.pk.outputs.processed }} | ${{ steps.pk.outputs.created }} | ${{ steps.pk.outputs.updated }} | ${{ steps.pk.outputs.cooldown }} | \$${{ steps.pk.outputs.cost }} | ${{ steps.pk.outputs.tokens }} |

    ### Totals
    - **Total Cost**: \$${{ steps.totals.outputs.cost }}
    - **Total Tokens**: ${{ steps.totals.outputs.tokens }}
    - **Total PRs Created**: ${{ steps.totals.outputs.prs_created }}
    - **Total PRs Updated**: ${{ steps.totals.outputs.prs_updated }}

    ### Pattern Library Status
    - **Patterns in Library**: ${{ steps.patterns.outputs.total }}
    - **Patterns Used This Run**: ${{ steps.patterns.outputs.used }}
    - **Zero-Cost Fixes**: ${{ steps.patterns.outputs.zero_cost }}

    ### Safety Metrics
    - **Max Diff Lines**: ${{ env.MAX_DIFF_LINES }}
    - **Max Files Changed**: ${{ env.MAX_FILES }}
    - **Budget Limit**: \$${{ env.MAX_RUN_COST }}
    - **Budget Used**: \$${{ steps.totals.outputs.cost }}
    - **Budget Remaining**: \$${{ steps.totals.outputs.budget_remaining }}
    EOF
```

**Acceptance Criteria**:
- ✅ Summary shows per-repo metrics (issues, PRs, cost, tokens)
- ✅ Summary shows totals across all repos
- ✅ Summary shows pattern library status
- ✅ Summary shows safety metrics

#### Task 1.2: JSONL Artifacts for Analytics

**File**: `homeostat/telemetry/jsonl-logger.ts` (new)

**Requirements**:
- Class `JSONLLogger`
- Method `logRunMetrics(metrics: RunMetrics): void`
- Write one JSON object per line to `artifacts/run-{timestamp}.jsonl`
- Include: timestamp, repo, fingerprints, PRs, cost, tokens, latency, errors

**Implementation**:
```typescript
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface RunMetrics {
  timestamp: string;
  repo: string;
  fingerprintsProcessed: string[];
  prsCreated: number;
  prsUpdated: number;
  cooldowns: number;
  cost: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  latency: number;
  errors: string[];
  patternsUsed: number;
  zeroCostFixes: number;
}

export class JSONLLogger {
  private static ARTIFACTS_DIR = 'artifacts';

  static logRunMetrics(metrics: RunMetrics): void {
    // Ensure artifacts directory exists
    mkdirSync(this.ARTIFACTS_DIR, { recursive: true });

    // Create filename with timestamp
    const filename = `run-${Date.now()}.jsonl`;
    const filepath = join(this.ARTIFACTS_DIR, filename);

    // Write JSON line
    const line = JSON.stringify(metrics) + '\n';
    appendFileSync(filepath, line);
  }

  static async aggregateMetrics(since: Date): Promise<{
    totalCost: number;
    totalTokens: number;
    totalPRs: number;
    avgLatency: number;
    errorRate: number;
  }> {
    // TODO: Read all JSONL files, filter by timestamp, aggregate
    // Return aggregated metrics for dashboards
    return {
      totalCost: 0,
      totalTokens: 0,
      totalPRs: 0,
      avgLatency: 0,
      errorRate: 0
    };
  }
}
```

**Acceptance Criteria**:
- ✅ JSONL files created in `artifacts/` directory
- ✅ One JSON object per line (valid JSONL format)
- ✅ All metrics captured (cost, tokens, latency, errors)
- ✅ Files can be parsed and aggregated

#### Task 1.3: Enhanced PR Template

**File**: `homeostat/templates/pr-template.ts` (new)

**Requirements**:
- Function `generatePRBody(params): string`
- Include: fingerprint, error details, attempt state, fix summary, test results, opt-out instructions

**Template**:
```markdown
## 🤖 Homeostat Auto-Fix

**Fingerprint**: `{fingerprint.id}`
**Error Type**: {error.type}
**File**: {error.filePath}
**Attempt**: {attemptState.attempts + 1}/{MAX_ATTEMPTS}

### What Changed
{patchSummary}

### Error Details
**Message**: {error.message}

**Stack Trace** (sanitized):
\`\`\`
{sanitizedStack}
\`\`\`

### Breadcrumbs (User Actions)
{breadcrumbs}

### Test Results
- ✅ **Tests Passed**: {testResults.passed}/{testResults.total}
- ✅ **TypeScript**: No errors
- ✅ **Lint**: Passed

### Homeostat State
\`\`\`json
{
  "fingerprint": "{fingerprint.id}",
  "tier": {tierUsed},
  "attempts": {attemptState.attempts + 1},
  "lastAttemptAt": "{new Date().toISOString()}",
  "backoffUntil": "{nextBackoff.toISOString()}",
  "cost": "${fixCost}",
  "tokens": {tokenCount},
  "source": "{fixSource}"  // "pattern" or "ai"
}
\`\`\`

### How to Opt-Out
Add label `do-not-fix` to the original issue to prevent future attempts.

### Safety Checks
- ✅ Diff size: {diffLines} lines (limit: {MAX_DIFF_LINES})
- ✅ Files changed: {fileCount} files (limit: {MAX_FILES})
- ✅ No secrets detected
- ✅ Path filters passed

---
*Generated by Homeostat v1.0.0 | Pattern: {patternId || 'N/A'} | Confidence: {confidence || 'N/A'}*
```

**Acceptance Criteria**:
- ✅ PR template includes all required sections
- ✅ Safety checks section validates guardrails
- ✅ Pattern information included (when applicable)
- ✅ Opt-out instructions clear

---

## Step 2: End-to-End Integration Testing

### Test Scenario 1: Multi-Repo Workflow

**Create**: `tests/e2e/multi-repo-workflow.test.ts`

**Test Cases**:
1. **3-Repo Processing**: Workflow processes all 3 repos (convert-my-file, notebridge, palette-kit)
2. **PR Budget Enforcement**: Max 2 PRs created per repo per run
3. **Path Filters**: Only files in `src/`, `content/`, `background/` are modified
4. **Idempotency**: Duplicate fingerprints don't create duplicate PRs
5. **Rate Limiting**: Repos processed serially (no parallel spam)

**Acceptance Criteria**:
- ✅ All 5 test cases passing
- ✅ No flaky tests (run 3x to verify)
- ✅ Mock GitHub API responses

### Test Scenario 2: Self-Healing Flow with Feature Flags

**Create**: `tests/e2e/self-healing-feature-flags.test.ts`

**Test Cases**:
1. **Dev Mode**: Pattern extraction disabled, matching works (returns null)
2. **Test Mode**: Pattern extraction disabled, matching works (returns null)
3. **Production Mode**: Pattern extraction enabled, matching works, learning works
4. **Zero-Cost Fix**: Pattern match succeeds, no AI call, PR created
5. **AI Fallback**: No pattern match, AI tier selected, pattern extracted

**Acceptance Criteria**:
- ✅ All 5 test cases passing
- ✅ Feature flag behavior validated in all modes
- ✅ Zero-cost fixes work when patterns exist
- ✅ Pattern extraction only happens in production mode

### Test Scenario 3: Safety Guardrails

**Create**: `tests/e2e/safety-guardrails.test.ts`

**Test Cases**:
1. **Diff Size Cap**: Reject fixes >500 lines
2. **File Count Cap**: Reject fixes touching >10 files
3. **Budget Cap**: Stop processing when cost exceeds $1.00/run
4. **Secret Detection**: Reject PRs containing API keys or secrets
5. **Path Filter Violation**: Skip fixes touching excluded paths (tests/, docs/)

**Acceptance Criteria**:
- ✅ All 5 test cases passing
- ✅ Caps enforced correctly
- ✅ Logs show rejection reasons

---

## Step 3: Final Integration & Validation

### Task 3.1: Update Orchestrator for Observability

**File**: `homeostat/orchestrator.ts` (modify)

**Add**:
- JSONL logging for each fix attempt
- Enhanced PR template usage
- Safety guardrails enforcement
- Pattern library metrics tracking

**Example Integration**:
```typescript
import { JSONLLogger } from './telemetry/jsonl-logger';
import { generatePRBody } from './templates/pr-template';

// After fix attempt
const metrics: RunMetrics = {
  timestamp: new Date().toISOString(),
  repo: repoConfig.slug,
  fingerprintsProcessed: [fingerprint.id],
  prsCreated: created ? 1 : 0,
  prsUpdated: created ? 0 : 1,
  cooldowns: skippedDueToCooldown ? 1 : 0,
  cost: totalCost,
  tokens: {
    input: inputTokens,
    output: outputTokens,
    cacheRead: cacheReadTokens,
    cacheWrite: cacheWriteTokens
  },
  latency: endTime - startTime,
  errors: [],
  patternsUsed: usedPattern ? 1 : 0,
  zeroCostFixes: usedPattern ? 1 : 0
};

JSONLLogger.logRunMetrics(metrics);
```

**Acceptance Criteria**:
- ✅ Metrics logged for every fix attempt
- ✅ Enhanced PR template used
- ✅ Safety guardrails enforced
- ✅ No regressions to existing flow

### Task 3.2: Update Documentation

**File**: `CLAUDE.md` (modify)

**Update "Current Focus" section**:
```markdown
## Current Focus

**Date**: 2025-10-24
**Status**: ✅ **PRODUCTION READY + ENHANCEMENTS COMPLETE**
**Test Results**: 193/193 base tests + XX new tests passing (100%)
**Coverage**: 97.9%-100% on all critical modules
**Projected Cost**: $5.77-$6.99/year (38% under $9.28 target)

**New Capabilities**:
- ✅ Multi-repository support (central workflow for 3 extensions)
- ✅ Self-healing loop with feature flag (pattern learning from day 1)
- ✅ Enhanced observability (summaries, JSONL, safety metrics)

**Next Steps**: Deploy to Convert My File production (see `docs/REMAINING-TASKS.md`)
```

**File**: `README.md` (modify)

**Update "Features" section**:
```markdown
## Features

- 🤖 **Automated Error Fixing**: AI-powered bug detection and repair
- 🔒 **Privacy-First**: Tiered security (sensitive files → GPT-5 only)
- 💰 **Cost-Effective**: $9.28/year for 1,000 fixes (97.7% savings vs alternatives)
- 📊 **Multi-Tier Strategy**: 70% DeepSeek (cheap) + 25% hybrid + 5% GPT-5 (complex)
- 🔄 **Smart Retry Logic**: 2-attempt strategy with deterministic failure detection
- ✅ **Test-Gated**: Only merges fixes that pass test suite
- 🏢 **Multi-Repository Support**: Central workflow manages multiple extension repos
- 🧠 **Self-Healing Loop**: Pattern learning from successful fixes (feature flag controlled)
- 📈 **Enhanced Observability**: Summaries, JSONL metrics, safety guardrails
```

**File**: `docs/FUTURE-ENHANCEMENTS.md` (modify)

**Mark as complete**:
- ✅ Enhancement 5: Multi-Repository Support (COMPLETE)
- ✅ Enhancement 4: Self-Healing Loop (COMPLETE - infrastructure with feature flag)

---

## Step 4: Pre-Merge Validation

### Validation Checklist

**Run all tests**:
```bash
npm test
npm run test:coverage
npm run bench
npm run cost:check
npm run typecheck
```

**Acceptance Criteria**:
- ✅ All tests passing (193 base + XX new)
- ✅ Coverage ≥95% on new modules
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ Cost projections still under $9.28/year

**Manual Testing**:
1. **Test multi-repo config parsing**: `yq .homeostat/repos.yml`
2. **Test feature flag behavior**: Set `HOMEOSTAT_ENV=dev`, verify extraction disabled
3. **Test pattern library**: Verify `shared/patterns/library.json` is empty

---

## Completion Summary Template

**Instructions**: Fill out this checklist when Session 2 is complete.

```markdown
## Codex Session 2 Completion Report

### Branch Status
- [x] Feature branch: `feature/high-priority-enhancements`
- [x] All commits pushed to origin

### Priority 3: Enhanced Observability
- [ ] `.github/workflows/multi-repo-orchestrator.yml` updated (added summary)
- [ ] `homeostat/telemetry/jsonl-logger.ts` created (XXX lines)
- [ ] `homeostat/templates/pr-template.ts` created (XXX lines)
- [ ] Unit tests created:
  - [ ] `tests/unit/telemetry/jsonl-logger.test.ts` (X tests)
  - [ ] `tests/unit/templates/pr-template.test.ts` (X tests)

### End-to-End Testing
- [ ] `tests/e2e/multi-repo-workflow.test.ts` created (5 tests)
- [ ] `tests/e2e/self-healing-feature-flags.test.ts` created (5 tests)
- [ ] `tests/e2e/safety-guardrails.test.ts` created (5 tests)
- [ ] All E2E tests passing

### Integration
- [ ] `homeostat/orchestrator.ts` updated (added observability)
- [ ] JSONL logging integrated
- [ ] Enhanced PR template integrated
- [ ] Safety guardrails enforced

### Final Validation
- [ ] All tests passing (193 + XX new = XXX total)
- [ ] Coverage ≥95% on new modules
- [ ] TypeScript compiles with no errors
- [ ] No ESLint warnings
- [ ] Cost projections still under $9.28/year

### Documentation
- [ ] `CLAUDE.md` updated (Current Focus + Features)
- [ ] `README.md` updated (Features section)
- [ ] `docs/FUTURE-ENHANCEMENTS.md` updated (mark P1+P2 complete)

### What Works
- Multi-repo workflow: [describe E2E test results]
- Feature flag behavior: [describe dev/test/prod validation]
- Observability: [describe summaries, JSONL, PR templates]
- Safety guardrails: [describe caps and enforcement]

### Known Issues/Limitations
- [ ] List any discovered edge cases
- [ ] List any needed follow-up work
- [ ] List any manual testing needed before merge

### Ready to Merge
- [ ] Yes / No (explain if no)

### Git Commands Run
```bash
git add .
git commit -m "feat: add enhanced observability and complete high-priority enhancements

- Enhanced GitHub Actions summaries (per-repo + totals + pattern library)
- JSONL artifacts for analytics (cost, tokens, latency, errors)
- Enhanced PR templates (fingerprint, state, safety checks, opt-out)
- E2E tests for multi-repo workflow (5 tests)
- E2E tests for self-healing feature flags (5 tests)
- E2E tests for safety guardrails (5 tests)
- Updated orchestrator with observability integration
- All tests passing (XXX total)
- Coverage ≥95% on all new modules

Complete feature:
- Multi-repository support (central workflow)
- Self-healing loop with HOMEOSTAT_ENV feature flag
- Enhanced observability and safety guardrails

Ready for production deployment to Convert My File
"
git push origin feature/high-priority-enhancements
```

### Time Spent
- Observability: X hours
- E2E testing: X hours
- Integration: X hours
- Documentation: X hours
- Validation: X hours
- **Total**: XX hours

### Merge Strategy
**Recommended**: Squash and merge to main
- Creates single commit with all changes
- Clean git history
- Easy to revert if needed

**Command**:
```bash
# After PR review and approval
gh pr merge --squash --delete-branch
```
```

---

## Safety Notes

1. **Verify feature flags work** - Test in dev/test/prod modes
2. **Verify no regressions** - All 193 base tests must still pass
3. **Verify safety guardrails** - Caps must be enforced
4. **Verify observability** - Summaries and JSONL must be accurate

---

## Questions or Issues?

If you encounter blockers:
1. Document the issue in "Known Issues/Limitations"
2. Commit working code so far
3. Report back for guidance

**Expected Duration**: 2-4 hours (autonomous execution)
**Next Step**: Create PR and request review before merging to main
