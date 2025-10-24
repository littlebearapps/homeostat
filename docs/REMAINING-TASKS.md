# Homeostat - Remaining Tasks

**Status**: Ready for Phase 2 deployment
**Last Updated**: 2025-10-24
**Trial Extension**: Convert My File (changed from NoteBridge per user request)

---

## 📋 Phase 2: Convert My File Deployment (2-3 hours)

**Repository**: `~/claude-code-tools/lba/apps/chrome-extensions/convert-my-file/main/`

### Task 2.1: Repository Setup ✅ Pre-flight Checks

- [ ] Navigate to Convert My File repository
  ```bash
  cd ~/claude-code-tools/lba/apps/chrome-extensions/convert-my-file/main/
  ```

- [ ] Verify CloakPipe integration is complete
  ```bash
  # Check if CloakPipe Phase 3 is complete
  # See: ~/claude-code-tools/lba/tools/cloakpipe/main/CLAUDE.md
  grep -i "phase 3" ~/claude-code-tools/lba/tools/cloakpipe/main/CLAUDE.md
  ```

- [ ] Confirm test suite exists and passes
  ```bash
  npm test
  # Expected: All tests passing
  ```

- [ ] Verify Convert My File has GitHub repository
  ```bash
  git remote -v
  # Expected: github.com/littlebearapps/convert-my-file
  ```

---

### Task 2.2: GitHub Secrets Configuration 🔐

**Location**: GitHub.com → convert-my-file repo → Settings → Secrets and variables → Actions

- [ ] Add secret: `DEEPSEEK_API_KEY`
  - **Source**: https://platform.deepseek.com
  - **Value**: DeepSeek V3.2-Exp API key from Keychain
  - **Command**: `kc_get DEEPSEEK_API_KEY`

- [ ] Add secret: `OPENAI_API_KEY`
  - **Source**: https://platform.openai.com
  - **Value**: GPT-5 API key from Keychain
  - **Command**: `kc_get OPENAI_API_KEY`

- [ ] Verify: `GITHUB_TOKEN` is auto-provided
  - **Check**: Settings → Actions → General → Workflow permissions
  - **Expected**: "Read and write permissions" enabled

---

### Task 2.3: Add Homeostat Workflow 📝

- [ ] Create workflow file directory
  ```bash
  mkdir -p .github/workflows
  ```

- [ ] Create `.github/workflows/homeostat.yml`
  ```bash
  # Copy template from Homeostat repo
  cat ~/claude-code-tools/lba/tools/homeostat/main/.github/workflows/homeostat.yml
  ```

- [ ] Update workflow file with repository paths
  - Replace any Homeostat-specific paths with Convert My File paths
  - Verify Node.js version matches package.json (likely 20)

- [ ] Commit and push workflow file
  ```bash
  git add .github/workflows/homeostat.yml
  git commit -m "feat: add Homeostat automated error fixing workflow"
  git push origin main
  ```

- [ ] Verify workflow appears in GitHub Actions tab
  - **Check**: https://github.com/littlebearapps/convert-my-file/actions
  - **Expected**: "Homeostat" workflow listed

---

### Task 2.4: Branch Protection 🛡️

**Location**: GitHub.com → convert-my-file → Settings → Branches

- [ ] Click "Add branch protection rule"

- [ ] Configure protection rule:
  - **Branch name pattern**: `main`
  - **☑️ Require a pull request before merging**
    - Required approvals: 0 (solo developer)
    - ☐ Dismiss stale PR approvals when new commits are pushed
    - ☐ Require review from Code Owners
  - **☑️ Require status checks to pass before merging**
    - ☑️ Require branches to be up to date before merging
    - Status checks: (will populate after first workflow run)
  - **☐ Require conversation resolution before merging** (optional)
  - **☐ Require signed commits** (optional)
  - **☐ Require linear history** (optional)
  - **☐ Include administrators** (optional, your choice)
  - **☑️ Allow force pushes** → Specify who can force push → Nobody
  - **☑️ Allow deletions** → ☐ (prevent main deletion)

- [ ] Click "Create" to save protection rules

- [ ] Verify protection active
  - **Check**: Settings → Branches → Branch protection rules
  - **Expected**: `main` listed with rules

---

### Task 2.5: Test Installation ✅

- [ ] Create test issue manually on GitHub

  **Navigate to**: https://github.com/littlebearapps/convert-my-file/issues/new

  **Title**:
  ```
  [ConvertMyFile] TestError: Homeostat trial
  ```

  **Body**:
  ```markdown
  ## Error Details
  - Extension: ConvertMyFile v1.0.0
  - Error Type: TestError
  - Message: Test message for Homeostat integration
  - Timestamp: 2025-10-24T10:00:00Z
  - Fingerprint: test-homeostat-123

  ## Stack Trace
  ```
  Error: Test error
    at testFunction (content/converter.js:42:15)
    at <anonymous>:1:1
  ```

  ## Breadcrumbs
  1. User clicked "Convert File" button
  2. Called testFunction()
  3. Error thrown at converter.js:42
  ```

- [ ] Add label: `robot`
  - **How**: Right sidebar → Labels → Add `robot` label
  - **If label doesn't exist**: Create it (Settings → Labels → New label)

- [ ] Monitor GitHub Actions workflow
  - **Check**: Actions tab → "Homeostat" workflow
  - **Expected**: Workflow starts within 1 minute
  - **Timeout**: 15 minutes max

- [ ] Verify workflow completion
  - **Success**: ✅ Green check, PR created
  - **Failure**: ❌ Red X, check logs for errors
  - **Logs**: Click workflow run → View job logs

- [ ] Check for PR creation
  - **Location**: Pull Requests tab
  - **Expected**: PR titled like "fix: resolve TestError in converter.js"
  - **Review**: Code changes, test results in PR description

- [ ] Review issue comment
  - **Expected**: Homeostat adds comment with status
  - **Format**: "Homeostat run completed. Status: success/failure"

- [ ] Merge test PR (if successful)
  ```bash
  # Via GitHub UI or CLI
  gh pr merge <PR_NUMBER> --squash
  ```

---

### Task 2.6: First 10 Fixes Monitoring 📊

**Duration**: 1-2 weeks (depending on error rate from CloakPipe)

- [ ] **Fix #1: Deep Analysis**
  - Review PR thoroughly (code quality, test coverage)
  - Check tier selected (should match complexity)
  - Verify cost in workflow logs
  - Validate sanitization (no PII in PR)
  - Time: How long did fix take? (target: <15 min)
  - Document any issues in GitHub issue with label `homeostat-feedback`

- [ ] **Fixes #2-5: Pattern Recognition**
  - Track tier distribution:
    - Tier 1: ___/5 (target: 3-4, 60-80%)
    - Tier 2: ___/5 (target: 1-2, 20-40%)
    - Tier 3: ___/5 (target: 0-1, 0-20%)
  - Success rate: ___/5 (target: >3, >60%)
  - Common error types: [list recurring patterns]
  - Average cost per fix: $___.__ (target: <$0.01)

- [ ] **Fixes #6-10: Validation**
  - Overall success rate: ___/10 (target: >7, >70%)
  - Cost tracking:
    - Tier 1: $___.__
    - Tier 2: $___.__
    - Tier 3: $___.__
    - Total: $___.__ (target: <$0.10 for 10 fixes)
  - Tier distribution alignment:
    - Tier 1: ___% (target: 70%)
    - Tier 2: ___% (target: 25%)
    - Tier 3: ___% (target: 5%)
  - Identified issues: [list any problems]

- [ ] **Document Learnings**
  - Create file: `docs/CONVERT-MY-FILE-LEARNINGS.md`
  - Include:
    - Common error patterns
    - Tier accuracy
    - Fix quality assessment
    - Cost analysis
    - Recommendations for threshold tuning

---

### Task 2.7: Threshold Tuning (if needed) ⚙️

**Trigger**: Complete after monitoring fixes #6-10

- [ ] **Analyze Tier Distribution**
  ```bash
  # Review metrics
  cd ~/claude-code-tools/lba/tools/homeostat/main/
  npm run cost:check
  ```

  **Current thresholds** (in `homeostat/routing/model-selector.js:79-93`):
  - Tier 1: `stackDepth <= 5 && fileCount === 1`
  - Tier 2: `stackDepth < 15 && fileCount <= 3`
  - Tier 3: All others

- [ ] **If Tier 3 usage >10%** (too many expensive fixes):

  **Action**: Increase Tier 1 threshold
  ```javascript
  // Change from:
  if (stackDepth <= 5 && fileCount === 1) { ... }

  // Change to:
  if (stackDepth <= 7 && fileCount === 1) { ... }
  ```

  **Test**:
  ```bash
  npm test -- tests/unit/model-selector.test.ts
  npm run bench  # Re-validate cost projections
  ```

- [ ] **If success rate <60%** (too many failures):

  **Option A**: Increase retry attempts for Tier 1
  ```javascript
  // In retry-handler.js, change:
  function defaultAttemptLimit(tier) {
    if (tierNumber === 3) return 1;
    return 2;  // Change to 3
  }
  ```

  **Option B**: Add GPT-5 reviewer to more Tier 1 fixes
  ```javascript
  // Add hybrid tier between 1 and 2
  if (stackDepth <= 3 && fileCount === 1) {
    return { tier: 1, model: 'deepseek', sanitize: true, attempts: 2 };
  }
  if (stackDepth <= 7 && fileCount === 1) {
    return { tier: 1.5, model: 'deepseek', reviewer: 'gpt-5', sanitize: true, attempts: 2 };
  }
  ```

- [ ] **Re-run benchmarks after tuning**
  ```bash
  npm run bench
  npm run cost:check
  # Verify: Projected cost still under $9.28/year
  ```

- [ ] **Commit threshold changes**
  ```bash
  git add homeostat/routing/model-selector.js homeostat/execution/retry-handler.js
  git commit -m "feat: adjust tier thresholds based on Convert My File data"
  git push origin main
  ```

- [ ] **Monitor next 5 fixes** to validate tuning effectiveness

---

## 📋 Phase 3: Extension Rollout (4-6 hours)

**Prerequisites**: Convert My File deployment successful (>70% success rate, cost <$10/year)

### Task 3.1: NoteBridge Deployment

**Repository**: `~/claude-code-tools/lba/apps/chrome-extensions/notebridge/main/`

- [ ] Repeat all Phase 2 tasks (2.1-2.7) for NoteBridge
- [ ] Repository setup and pre-flight checks
- [ ] Configure GitHub Secrets (DEEPSEEK_API_KEY, OPENAI_API_KEY)
- [ ] Add `.github/workflows/homeostat.yml`
- [ ] Enable branch protection on `main`
- [ ] Create test issue with `robot` label
- [ ] Monitor first 10 fixes
- [ ] Compare tier distribution vs Convert My File
- [ ] Document NoteBridge-specific patterns in `docs/NOTEBRIDGE-LEARNINGS.md`

---

### Task 3.2: PaletteKit Deployment

**Repository**: `~/claude-code-tools/lba/apps/chrome-extensions/palette-kit/main/`

- [ ] Repeat all Phase 2 tasks (2.1-2.7) for PaletteKit
- [ ] Repository setup and pre-flight checks
- [ ] Configure GitHub Secrets
- [ ] Add workflow file
- [ ] Enable branch protection
- [ ] Create test issue
- [ ] Monitor first 10 fixes
- [ ] Compare tier distribution vs Convert My File and NoteBridge
- [ ] Document PaletteKit-specific patterns in `docs/PALETTEKIT-LEARNINGS.md`

---

### Task 3.3: Cross-Extension Analysis 📈

**Trigger**: All 3 extensions have 10+ fixes each

- [ ] Aggregate metrics across extensions
  - Total fixes: ___
  - Overall success rate: ___%
  - Cost per extension:
    - Convert My File: $___.__
    - NoteBridge: $___.__
    - PaletteKit: $___.__
    - Total: $___.__ (target: <$9.28/year projected)

- [ ] Compare tier distributions
  ```
  Extension        | Tier 1 | Tier 2 | Tier 3
  -----------------|--------|--------|-------
  Convert My File  |  ___% |  ___% |  ___%
  NoteBridge       |  ___% |  ___% |  ___%
  PaletteKit       |  ___% |  ___% |  ___%
  Target           |   70%  |   25%  |    5%
  ```

- [ ] Identify common error patterns across extensions
  - Pattern 1: [e.g., "Cannot read property 'X' of undefined" - 35% of errors]
  - Pattern 2: [e.g., "chrome.storage.sync undefined" - 20% of errors]
  - Pattern 3: [e.g., "Async race condition" - 15% of errors]

- [ ] Document extension-specific patterns
  - Convert My File unique patterns: [list]
  - NoteBridge unique patterns: [list]
  - PaletteKit unique patterns: [list]

- [ ] Create cross-extension learnings document
  - **File**: `docs/EXTENSION-PATTERNS.md`
  - Include:
    - Common error types across all extensions
    - Extension-specific quirks
    - Recommended tier threshold adjustments per extension type
    - Opportunities for pattern learning (Enhancement 4)

- [ ] Validate future enhancements priorities
  - Review `docs/FUTURE-ENHANCEMENTS.md`
  - Update priorities based on production data
  - Estimate ROI for each enhancement with real cost numbers

---

## 📊 Ongoing: Monitoring & Maintenance

### Daily Monitoring (Optional - Manual)

**Time**: 5 minutes/day

- [ ] Check GitHub Actions for failed workflows
  ```bash
  # Via CLI
  gh run list --repo littlebearapps/convert-my-file --status failure --limit 5
  gh run list --repo littlebearapps/notebridge --status failure --limit 5
  gh run list --repo littlebearapps/palette-kit --status failure --limit 5
  ```

- [ ] Review Tier 1/2/3 success rates (manual log review)
  - Tier 1: Target >60%
  - Tier 2: Target >80%
  - Tier 3: Target >90%

- [ ] Monitor API cost (check OpenAI/DeepSeek dashboards)
  - Target: <$1/month average

---

### Weekly Reviews (10 minutes/week)

**Schedule**: Every Sunday

- [ ] Count GitHub issues received with `robot` label
  ```bash
  gh issue list --repo littlebearapps/convert-my-file --label robot
  gh issue list --repo littlebearapps/notebridge --label robot
  gh issue list --repo littlebearapps/palette-kit --label robot
  ```

- [ ] Count errors auto-fixed (merged PRs)
  ```bash
  gh pr list --repo littlebearapps/convert-my-file --state merged --label homeostat-fix
  # Repeat for other repos
  ```

- [ ] Review tier distribution vs targets
  - Extract from workflow logs or manual tracking spreadsheet

- [ ] Check for rollbacks (none expected in Phase 2-3)

- [ ] Document in weekly log: `docs/weekly-reports/2025-W<week>.md`

---

### Monthly Audits (30 minutes/month)

**Schedule**: First Sunday of each month

- [ ] **Privacy Audit**
  ```bash
  cd ~/claude-code-tools/lba/tools/homeostat/main/
  npm run test -- tests/security/pii-leak.test.ts
  ```
  - Review all merged PRs for accidental PII exposure
  - Check: No API keys, emails, file paths visible
  - Update: PII sanitization patterns if new leak vectors discovered

- [ ] **Cost Analysis**
  ```bash
  npm run cost:check
  ```
  - Compare projected vs actual API bills
  - OpenAI dashboard: https://platform.openai.com/usage
  - DeepSeek dashboard: https://platform.deepseek.com/usage
  - Target: <$10/year ($0.83/month)
  - If exceeding: Investigate tier distribution, adjust thresholds

- [ ] **Success Rate Trends**
  - Calculate monthly success rate per tier
  - Plot trend (manual spreadsheet or future dashboard)
  - Identify declining trends → investigate causes

- [ ] **Extension-Specific Patterns**
  - Review: Which extensions have highest fix success rates?
  - Analyze: Error patterns unique to each extension
  - Action: Share learnings with extension teams

- [ ] **Future Enhancements Review**
  - Re-read: `docs/FUTURE-ENHANCEMENTS.md`
  - Assess: Should any enhancement be prioritized now?
  - Update: Enhancement priorities based on real needs

---

## ✅ Completion Criteria

### Phase 2 Complete When:
- [x] Convert My File has Homeostat workflow active
- [x] 10+ fixes attempted
- [x] Success rate >60%
- [x] Projected annual cost <$10/year
- [x] No blocking issues identified

### Phase 3 Complete When:
- [x] All 3 extensions (Convert My File, NoteBridge, PaletteKit) deployed
- [x] Each extension has 10+ fixes
- [x] Cross-extension analysis complete
- [x] Overall success rate >70%
- [x] Total projected cost <$9.28/year
- [x] `docs/EXTENSION-PATTERNS.md` created

### Homeostat Production Complete When:
- [x] Phase 2 and 3 complete
- [x] 3+ months of production data collected
- [x] Monthly audits in place
- [x] Future enhancements priorities validated
- [x] Team trained on monitoring procedures

---

## 📝 Notes

- **Trial extension change**: User requested Convert My File instead of NoteBridge for initial rollout
- **Future enhancements**: All optional enhancements documented in `docs/FUTURE-ENHANCEMENTS.md` - do not implement now
- **Canary deployment**: Code exists but full implementation deferred until 100+ fixes collected
- **Monitoring**: Manual monitoring sufficient for Phase 2-3, automated monitoring deferred to future enhancement

**Last Updated**: 2025-10-24
