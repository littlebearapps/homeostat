# CloakPipe Multi-Platform Compatibility Analysis for Homeostat

**Status**: ✅ **WEEK 0 COMPLETE - READY FOR WEEK 1 IMPLEMENTATION**
**Created**: 2025-10-29
**Updated**: 2025-10-29 (Week 0 complete, Cloakpipe confirmed)
**Analysis**: GPT-5 Deep Think (5 steps, very high confidence)
**CloakPipe Plan**: `cloakpipe/docs/MULTI-PLATFORM-EXTENSION-PLAN.md` (v1.0, GPT-5 validated)
**Homeostat Contract**: `homeostat/docs/CLOAKPIPE-INTEGRATION.md` (v1.0.0, will update to v2.0.0 in Week 1)

---

## Executive Summary

**Verdict**: ✅ **APPROVED BY PLATFORM - WEEK 0 COMPLETE**

CloakPipe's expansion to WordPress, VPS tools, and cross-browser extensions is **100% backward compatible** (confirmed by Cloakpipe). New server sources (WordPress, VPS) require Homeostat parser updates but maintain all existing contracts.

**Key Findings**:
- ✅ **Zero breaking changes** to Chrome extension behavior (CONFIRMED by Cloakpipe)
- ✅ **~8.5 hours** Homeostat implementation effort (LOW RISK)
- ✅ **Deployment order**: Homeostat deploys BEFORE CloakPipe (CONFIRMED)
- ✅ **Issue format**: WordPress/VPS use same `[{product}] {errorType}: {summary}` format (CONFIRMED)
- ✅ **ErrorType extraction**: All sources use native exception class names (CONFIRMED)

**Timeline**: 5 weeks total (Week 0 ✅ COMPLETE)
- **Week 0**: ✅ **COMPLETE** - Platform created 3 repos, configured 9 secrets, got Cloakpipe confirmation
- **Week 1**: 🚀 READY TO START - Homeostat implements dual parser (~8.5 hours)
- **Week 2**: Homeostat workflow installation and testing (~3 hours)
- **Week 3**: Cloakpipe dev deployment + E2E testing
- **Week 4**: Cloakpipe prod deployment + monitoring

**Week 0 Status**: ✅ **COMPLETE** (2025-10-29)
- Repositories created: `claudecode-wordpress-mcp`, `brand-copilot`, `auditor-toolkit`
- Secrets configured: 9 total (3 repos × 3 secrets)
- Cloakpipe confirmation: All 4 verification questions answered
- Service Registry updated: 2 services added
- **Gate PASSED**: Ready for Week 1 implementation

**Platform Feedback**: ✅ APPROVED by Platform Team (Instance M) - Week 0 complete

---

## Compatibility Assessment

### ✅ 100% Backward Compatible (Chrome Extensions)

**Labels** - ALL PRESERVED:
- `robot` - Triggers Homeostat ✅
- `hop:0`, `hop:1`, `hop:2`, `hop:3` - Circuit breaker state ✅
- `maxhop:3` - Circuit breaker threshold ✅
- `source:cloakpipe` - Origin system ✅
- `correlation:XXXXXXXX` - Correlation ID (8 chars) ✅
- `fingerprint:XXXXXXXX` - Error fingerprint (8 chars) ✅
- `<extension-name>` - Product label (e.g., `convert-my-file`) ✅

**Schema** - PRESERVED:
- Old `extension` field supported via backward compat adapter (CloakPipe plan lines 1165-1177)
- Mapped internally to `product` field
- Existing extensions work without changes

**Rate Limits** - UNCHANGED:
- 100 issues/day per extension
- Immediate issue creation (no cooldown)
- No occurrence threshold

**Deduplication** - UNCHANGED:
- Daily fingerprint: `fp:${today}:${fingerprint}`
- Resets at midnight UTC

**Repository Routing** - UNCHANGED:
- Convert My File → `littlebearapps/convert-my-file`
- NoteBridge → `littlebearapps/notebridge`
- Palette Kit → `littlebearapps/palette-kit`

**Issue Title** - UNCHANGED:
- Format: `[ExtensionName] ErrorType: Error message`
- Example: `[NoteBridge] TypeError: Cannot read property 'sync'`

**Issue Template** - UNCHANGED:
- `## Error Details` section with bullet list
- `## Stack Trace` section with code block
- `## Breadcrumbs` section with numbered list
- `## User Description` section (optional)

### ✅ New Capabilities (WordPress, VPS)

**New Source Types**:
- `source: 'wordpress'` - WordPress plugin errors (PHP, admin UI JavaScript)
- `source: 'vps'` - VPS tool errors (Node.js Brand Copilot, Python Auditor Toolkit)

**New Labels**:
- `source:wordpress` or `source:vps` - Source type
- `runtime:php|node|python|ui` - Runtime environment
- `env:prod|staging|dev` - Deployment environment
- `severity:fatal|error|warn` - Error severity
- `autofix:tier1|tier2|tier3` - CloakPipe's tier suggestion (advisory only)
- `type:error` or `type:feedback` - Report type

**Different Template Format** (WordPress/VPS):
```markdown
**Summary:** Error message
**Occurrences:** 3 (first: timestamp, last: timestamp)
**Fingerprint:** abc123
**Env:** prod • **Version:** 1.0.0 • **Runtime:** php
**Location:** file.php:42
**Context:** ...
**Stack Trace:**
```
...
```
**Autofix Suggestion:** tier2
```

**Different Rate Limits**:
- WordPress: 10 issues/day, 5min cooldown, 3 occurrences before issue creation
- VPS: 3 issues/day, 5min cooldown, 1 occurrence (immediate)

**Different Deduplication**:
- Version-scoped: `srv:${product}:${fingerprint}:${version}:${env}`
- Persistent across days (until version changes)

**New Repositories**:
- `littlebearapps/cloudcode-wp-plugin` (WordPress plugin)
- `littlebearapps/brand-copilot` (VPS - Brand Copilot)
- `littlebearapps/auditor-toolkit` (VPS - Auditor Toolkit)

---

## Breaking Changes Analysis

### ⚠️ WordPress/VPS Template Structure

**Issue**: Different template format breaks Homeostat's existing parser

**Homeostat's Current Parser** (expects `## Sections`):
```javascript
function parseIssueBody(body) {
  const sections = {
    errorDetails: extractSection(body, '## Error Details'),  // REQUIRED
    stackTrace: extractSection(body, '## Stack Trace'),      // REQUIRED
    breadcrumbs: extractSection(body, '## Breadcrumbs'),     // REQUIRED
  };

  const extension = parseField(sections.errorDetails, 'Extension');
  // ... parse from sections
}
```

**WordPress/VPS Template** (uses `**Field:**` format):
- No `## Error Details` section
- No `## Breadcrumbs` section
- Inline fields: `**Summary:**`, `**Occurrences:**`, etc.

**Impact**: Homeostat's `parseIssueBody()` will fail to extract required fields → parsing error → no fix attempted

**Mitigation**: Implement dual parser (see solution below)

---

## Required Homeostat Changes

### Total Effort: ~10 hours (LOW RISK)

**P0 (Blocking CloakPipe Deploy) - ~8.5 hours**:

1. **Dual Parser Implementation** (~2 hours)
   - Add `detectSource(issueLabels)` function (read `source:*` labels)
   - Add `parseServerIssue(body)` function (parse WordPress/VPS template)
   - Update `parseIssueBody(body, source)` to dispatch by source
   - Location: `homeostat/github/issue-parser.ts`

2. **Source Detection** (~30 min)
   - Read labels to determine source type
   - Fallback logic for backward compatibility

3. **Synthetic Breadcrumbs** (~30 min)
   - Generate breadcrumbs from file/line/component for servers
   - Make breadcrumbs optional in validation (not required for servers)

4. **Title Parser Hardening** (~30 min)
   - Add fallback if ErrorType missing
   - Handle server-style titles

5. **Repository Setup** (~3 hours)
   - Create 3 new repos (cloudcode-wp-plugin, brand-copilot, auditor-toolkit)
   - Install Homeostat workflows (`.github/workflows/homeostat.yml`)
   - Configure GitHub Secrets (DEEPSEEK_API_KEY, OPENAI_API_KEY, HOMEOSTAT_PAT) × 3 repos
   - Enable branch protection

6. **Integration Tests** (~2 hours)
   - Test extension parsing (unchanged behavior)
   - Test WordPress parsing (new template)
   - Test VPS parsing (new template)
   - Test source detection from labels
   - Test synthetic breadcrumb generation

**P1 (With CloakPipe Deploy) - ~1.5 hours**:

7. **Documentation Updates** (~1 hour)
   - Update CLOAKPIPE-INTEGRATION.md with multi-source support
   - Document new template formats (WordPress, VPS)
   - Document source detection logic
   - Document autofix:tier* label handling

8. **End-to-End Testing** (~30 min)
   - Test with CloakPipe dev environment
   - Verify extension regression (no changes)
   - Verify WordPress/VPS flow

**P2 (Post-Deploy Enhancements) - Future**:
- Occurrence count logging (WordPress: 3 occurrences → "frequent error")
- Existing PR check (prevent duplicate work on version changes)
- Tier label comparison logging (CloakPipe suggestion vs Homeostat decision)

---

## Implementation Specifications

### 1. Dual Parser (Core Change)

```javascript
// homeostat/github/issue-parser.ts

function detectSource(issueLabels) {
  const labelNames = issueLabels.map(l => l.name);

  if (labelNames.includes('source:wordpress')) return 'wordpress';
  if (labelNames.includes('source:vps')) return 'vps';
  if (labelNames.includes('source:cloakpipe')) return 'extension';

  // Fallback: Extension name labels
  const extensionLabels = ['notebridge', 'palette-kit', 'convert-my-file'];
  if (labelNames.some(l => extensionLabels.includes(l))) return 'extension';

  // Default: Assume extension (backward compatibility)
  return 'extension';
}

function parseIssueBody(body, source) {
  if (source === 'extension') {
    return parseExtensionIssue(body);  // Existing parser
  } else {
    return parseServerIssue(body);     // New parser
  }
}

function parseServerIssue(body) {
  // Parse inline fields: **Summary:** value
  const summary = parseInlineField(body, 'Summary');
  const occurrences = parseInlineField(body, 'Occurrences');
  const fingerprint = parseInlineField(body, 'Fingerprint');
  const env = parseInlineField(body, 'Env');
  const version = parseInlineField(body, 'Version');
  const location = parseInlineField(body, 'Location');
  const stackTrace = extractCodeBlock(body);
  const autofixSuggestion = parseInlineField(body, 'Autofix Suggestion');

  // Extract file and line from location
  const [file, line] = location?.split(':') || [null, null];

  // Generate synthetic breadcrumbs (servers don't have user action trail)
  const breadcrumbs = [];
  if (location) breadcrumbs.push(`Error in ${location}`);
  if (context?.component) breadcrumbs.push(`Component: ${context.component}`);
  if (breadcrumbs.length === 0) breadcrumbs.push('Server-side error (no user interaction)');

  return {
    extension: null,  // Not applicable for servers
    product: null,    // Extract from labels in caller
    version,
    errorType: 'ServerError',  // Generic or parse from summary
    message: summary,
    timestamp: new Date(),  // Use issue created_at
    fingerprint,
    stackTrace,
    breadcrumbs,
    occurrences: parseInt(occurrences?.match(/^\d+/)?.[0]) || 1,
    env,
    autofixSuggestion  // tier1/tier2/tier3 (advisory only)
  };
}

function parseInlineField(body, fieldName) {
  const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n\\*\\*|\\n\\n|$)`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim().split('•')[0].trim() : null;  // Split on • for multi-value fields
}
```

### 2. Integration Updates

```javascript
// Update main parser entry point
async function parseCloakPipeIssue(issue) {
  const source = detectSource(issue.labels);
  const titleData = parseIssueTitle(issue.title);
  const bodyData = parseIssueBody(issue.body, source);

  // Combine and validate
  const parsed = {
    source,
    extensionName: bodyData.extension || titleData.extensionName,
    product: bodyData.product || extractProductFromLabels(issue.labels),
    errorType: titleData.errorType,
    errorMessage: titleData.errorMessage,
    version: bodyData.version,
    timestamp: bodyData.timestamp || new Date(issue.created_at),
    fingerprint: bodyData.fingerprint,
    stackTrace: bodyData.stackTrace,
    breadcrumbs: bodyData.breadcrumbs,
    occurrences: bodyData.occurrences || 1,
    env: bodyData.env,
    autofixSuggestion: bodyData.autofixSuggestion,
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    labels: issue.labels.map(l => l.name)
  };

  // Validate required fields (breadcrumbs optional for servers)
  const requiredFields = ['errorType', 'errorMessage', 'stackTrace', 'fingerprint'];
  for (const field of requiredFields) {
    if (!parsed[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return parsed;
}
```

### 3. Workflow Installation

**File**: `.github/workflows/homeostat.yml` (install in each new repo)

```yaml
name: Homeostat Auto-Fix
on:
  issues:
    types: [labeled]

jobs:
  fix:
    if: github.event.label.name == 'robot'
    uses: littlebearapps/homeostat/.github/workflows/multi-repo-orchestrator.yml@main
    secrets:
      DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      HOMEOSTAT_PAT: ${{ secrets.HOMEOSTAT_PAT }}
```

**GitHub Secrets** (configure in each repo):
- `DEEPSEEK_API_KEY` - DeepSeek V3.2-Exp API key
- `OPENAI_API_KEY` - GPT-5 API key (for Tier 2/3)
- `HOMEOSTAT_PAT` - GitHub PAT with `repo` + `project` scopes

**Branch Protection** (enable in each repo):
- Require status checks to pass
- Require PR reviews (optional for internal VPS tools)
- Include Homeostat workflow as required check

---

## Edge Cases & Risk Mitigation

### 1. Deployment Order (Critical)

**Risk**: CloakPipe deploys multi-platform before Homeostat updates → WordPress/VPS issues fail parsing

**Mitigation**:
- **MUST**: Deploy Homeostat parser updates BEFORE CloakPipe multi-platform
- Phased rollout:
  1. Week 1: Homeostat parser updates (dev)
  2. Week 2: Workflow installation + testing
  3. Week 3: CloakPipe deploy to dev + E2E testing
  4. Week 4: CloakPipe deploy to prod

**Graceful Degradation**:
- Homeostat catches parsing errors → adds `parsing-error` label (existing behavior)
- No fix attempted until parsing succeeds

### 2. Occurrence Count Handling

**Scenario**: WordPress error occurs 3 times → CloakPipe creates 1 issue with `Occurrences: 3`

**Homeostat Behavior**:
- Parse occurrence count
- Log: "Server error occurred 3 times before issue creation"
- Circuit breaker still starts at `hop:0` (occurrence count doesn't affect hops)
- Fix priority potentially higher (frequent error)

**Implementation**:
```javascript
const occCount = parsed.occurrences || 1;
logger.info(`Processing ${source} error (${occCount} occurrences)`);
// Use Homeostat's normal tier selection (ignore occurrence count)
```

### 3. Version Changes During Fix

**Scenario**:
1. Error reported in v1.0.0 → Homeostat creates PR
2. Before PR merged, v1.0.1 deployed
3. Same error reported in v1.0.1 → CloakPipe creates new issue (different dedup key)

**Risk**: Duplicate work, budget waste

**Mitigation** (P2):
- Check for existing PRs with same fingerprint
- If open PR exists → comment on new issue: "Similar fix pending in PR #X"
- Don't create second PR until first PR merged or closed

### 4. Autofix Tier Labels

**CloakPipe**: Suggests tier via `autofix:tier1|tier2|tier3` label

**Homeostat**: Computes tier independently via complexity analyzer

**Potential Conflict**: Low (Homeostat ignores suggestion labels currently)

**Recommendation**:
- **Short-term**: Ignore `autofix:tier*` labels
- **Long-term**: Log discrepancies for tuning
- **Future**: Use CloakPipe's suggestion as hint (override if complexity differs)

**Implementation**:
```javascript
async function analyzeComplexity(parsed) {
  const computedTier = selectTierBasedOnComplexity(parsed);

  if (parsed.autofixSuggestion && parsed.autofixSuggestion !== computedTier) {
    logger.warn(`Tier mismatch: CloakPipe=${parsed.autofixSuggestion}, Homeostat=${computedTier}`);
  }

  return computedTier;  // Use Homeostat's decision
}
```

### 5. Fingerprint Collision Across Sources

**Concern**: Extension error and WordPress error have same fingerprint?

**CloakPipe Fingerprint Computation** (plan lines 1823-1881):
```javascript
function extensionFingerprintBase(p) {
  return `src=ext|prod=${p.product}|msg=${p.message}|...`;
}

function serverFingerprintBase(p) {
  return `src=srv|type=${p.source}|prod=${p.product}|env=${p.env}|ver=${p.version}|msg=${p.message}|...`;
}
```

**Result**: Fingerprints namespaced by `src=ext` vs `src=srv` → **no collision**

### 6. Cross-Browser Support

**Firefox/Safari/Edge**: Same issue title format, same product name

**Differentiation**: Via `runtime:firefox|safari|edge` label only

**Homeostat Impact**: None (runtime is metadata, doesn't affect fix logic)

### 7. Backward Compatibility Break (CloakPipe)

**Risk**: CloakPipe accidentally removes `robot` label from extensions

**Verification**: CloakPipe plan line 411 confirms `robot` label preserved ✅

**CloakPipe Must**:
- Include `robot` label for ALL error reports (extensions + servers)
- NEVER remove `robot` for errors (feedback OK without robot)
- Add integration tests to verify `robot` label present

**Homeostat Guard**:
```javascript
if (!issue.labels.some(l => l.name === 'robot')) {
  logger.warn(`Issue #${issue.number} missing 'robot' label - skipping auto-fix`);
  await addComment(issue, '⚠️ Homeostat requires `robot` label to trigger auto-fix');
  return;
}
```

---

## Verification Questions for CloakPipe Team

### ⚠️ CRITICAL: Must Confirm Before Implementation

**1. WordPress/VPS Issue Title Format**

**Question**: What is the EXACT issue title format for WordPress and VPS errors?

**Expected**: `[ProductName] ErrorType: Error message`

**Examples**:
- WordPress: `[cloudcode-wp-plugin] PHPException: Failed to backup database`
- VPS (Node): `[brandcopilot] UnhandledRejection: ECONNREFUSED`
- VPS (Python): `[auditortoolkit] ValueError: Invalid input`

**Confirm**:
- Product in square brackets? ✅ / ❌
- ErrorType after brackets (before colon)? ✅ / ❌
- Colon separator? ✅ / ❌
- Error message after colon? ✅ / ❌

**How is ErrorType determined for servers?**:
- PHP: Exception class name? (`Exception`, `RuntimeException`, `PDOException`)
- Node.js: Error type? (`UnhandledRejection`, `TypeError`, `NetworkError`)
- Python: Exception class name? (`ValueError`, `RuntimeError`, `KeyError`)

**2. Deployment Timing**

**Question**: Can CloakPipe deploy to dev first (before prod) for Homeostat integration testing?

**Needed**: 1 week window for end-to-end testing

**Confirm**:
- CloakPipe dev environment available? ✅ / ❌
- Can deploy multi-platform to dev (Week 3) while Homeostat tests? ✅ / ❌
- Prod deploy deferred until Week 4? ✅ / ❌

**3. Backward Compatibility Testing**

**Question**: Will CloakPipe verify existing extensions still work unchanged?

**Critical**: Convert My File, NoteBridge, Palette Kit must continue working

**Confirm**:
- Integration tests verify `robot` label present? ✅ / ❌
- Integration tests verify title format unchanged? ✅ / ❌
- Integration tests verify template structure unchanged? ✅ / ❌
- Test plan includes regression testing for all 3 extensions? ✅ / ❌

---

## Deployment Sequence

### Week 0: Platform Preparation (NEW - Platform Team)

**Objective**: Create repositories, configure secrets, confirm CloakPipe questions

**Platform Team Actions** (2-3 hours):
- [ ] Create 3 new GitHub repositories
  - `littlebearapps/cloudcode-wp-plugin` (private)
  - `littlebearapps/brand-copilot` (private)
  - `littlebearapps/auditor-toolkit` (private)
- [ ] Configure GitHub Secrets (9 total: 3 repos × 3 secrets)
  - `DEEPSEEK_API_KEY` in all 3 repos
  - `OPENAI_API_KEY` in all 3 repos
  - `HOMEOSTAT_PAT` in all 3 repos
- [ ] Enable branch protection (main branch)
  - Require status checks to pass
  - Require PR reviews (1 approval)
  - Enforce for administrators
- [ ] Grant Homeostat PAT access
  - Settings → Actions → General → Workflow permissions → Read and write
- [ ] Add to Platform Service Registry
  - Update `service-registry.yaml` with 3 new services
- [ ] Send confirmation questions to CloakPipe (see Verification Questions section)
  - WordPress/VPS issue title format
  - ErrorType extraction logic
  - Deployment timing coordination
- [ ] Configure Healthchecks.io monitors
  - Brand Copilot: daily-report cron job
  - Auditor Toolkit: weekly audit cron job

**Gate**: All repos created, secrets configured, CloakPipe questions answered

---

### Week 1: Homeostat Preparation

**Objective**: Implement parser updates, deploy to dev

**Tasks**:
- [ ] Day 1-2: Implement dual parser (extension vs server)
  - Add `detectSource(issueLabels)`
  - Add `parseServerIssue(body)`
  - Update `parseIssueBody(body, source)`
  - Add `parseInlineField()` helper
  - Generate synthetic breadcrumbs
- [ ] Day 2-3: Add source detection, synthetic breadcrumbs
  - Make breadcrumbs optional in validation
  - Add title parser fallback
  - Add occurrence count parsing
- [ ] Day 3-4: Write integration tests
  - Test source detection (all 3 types)
  - Test extension parsing (unchanged)
  - Test WordPress parsing (new template)
  - Test VPS parsing (new template)
  - Test synthetic breadcrumb generation
- [ ] Day 4-5: Update documentation
  - Update CLOAKPIPE-INTEGRATION.md
  - Document new templates
  - Document source detection logic
- [ ] Day 5: Deploy Homeostat changes to dev environment

**Gate**: All tests passing (291+ tests), dev deployment successful

---

### Week 2: Repository Setup & Testing

**Objective**: Install workflows in new repos, test with synthetic issues

**Tasks**:
- [ ] ~~Day 6: Create new repositories~~ **SKIP** (Platform handled in Week 0)
- [ ] Day 7-8: Install Homeostat workflows
  - Copy `.github/workflows/homeostat.yml` to each repo
  - Update workflow to use correct secrets
  - Test workflow triggers on label events
- [ ] ~~Day 8-9: Configure secrets~~ **SKIP** (Platform handled in Week 0)
- [ ] Day 9-10: Test with synthetic issues
  - Create test WordPress issue (copy template from plan)
  - Create test VPS issue (copy template from plan)
  - Verify Homeostat parses correctly
  - Verify tier selection works
  - Verify PR creation succeeds
  - Verify circuit breaker labels applied

**Gate**: Homeostat successfully processes synthetic WordPress/VPS issues

---

### Week 3: CloakPipe Integration

**Objective**: Deploy CloakPipe multi-platform to dev, test end-to-end

**Tasks** (CloakPipe Team):
- [ ] Day 11: Deploy CloakPipe multi-platform to dev
  - Configure KV namespaces (SOURCE_KEYS, REPO_MAPPING)
  - Add source keys for WordPress/VPS products
  - Update CORS headers for cross-browser
- [ ] Day 12: End-to-end testing
  - Trigger WordPress error → verify issue created → verify Homeostat fixes
  - Trigger VPS error → verify issue created → verify Homeostat fixes
  - Trigger extension error → verify unchanged behavior
  - Test Firefox/Safari extensions (if ready)
- [ ] Day 13: Fix integration issues
  - Address any parsing errors discovered
  - Tune tier selection if needed
  - Fix workflow configuration issues

**Gate**: End-to-end flow works (CloakPipe dev → Homeostat dev → PR created)

---

### Week 4: Production Rollout

**Objective**: Deploy CloakPipe multi-platform to prod, monitor first fixes

**Tasks**:
- [ ] Day 14: Deploy CloakPipe multi-platform to prod
  - Configure prod KV namespaces
  - Rotate source keys (prod ≠ dev)
  - Update repo mappings
- [ ] Day 15-21: Monitor first 10-20 fixes
  - WordPress fixes: Track success rate (target: >70%)
  - VPS fixes: Track success rate (target: >70%)
  - Extension fixes: Verify no regressions (target: 100%)
  - Track parsing errors (target: 0%)
  - Track tier selection distribution
  - Track budget consumption (servers vs extensions)
- [ ] Day 21: Review and tune
  - Analyze fix quality
  - Tune tier selection if needed
  - Adjust rate limits if needed
  - Document learnings

**Gate**: >70% fix success rate for WordPress/VPS, zero extension regressions

---

## Success Criteria

### Week 1 (Homeostat Prep)
- ✅ All unit tests passing (source detection, server parsing, breadcrumbs)
- ✅ Integration tests passing (synthetic WordPress/VPS issues)
- ✅ Dev deployment successful
- ✅ Zero extension regressions

### Week 2 (Repository Setup)
- ✅ 3 new repos created with workflows installed
- ✅ GitHub Secrets configured (3 secrets × 3 repos = 9 total)
- ✅ Synthetic issues parsed correctly
- ✅ Test PRs created in new repos

### Week 3 (CloakPipe Integration)
- ✅ End-to-end flow works (CloakPipe dev → Homeostat dev)
- ✅ Extensions still work unchanged
- ✅ WordPress issues parsed correctly
- ✅ VPS issues parsed correctly

### Week 4 (Production)
- ✅ CloakPipe multi-platform deployed to prod
- ✅ First 10 WordPress fixes: >70% success rate
- ✅ First 10 VPS fixes: >70% success rate
- ✅ Zero extension regressions (Convert My File, NoteBridge, Palette Kit)
- ✅ Zero parsing errors
- ✅ Budget consumption within caps ($0.066/day per repo)

---

## Risk Matrix

| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|-----------|-------|
| CloakPipe deploys before Homeostat ready | Medium | High | Phased rollout (Homeostat first) | Platform |
| WordPress/VPS template breaks parser | Low | High | Comprehensive tests, synthetic issues | Homeostat |
| Title format differs from expectation | Medium | High | Confirm with CloakPipe team NOW | CloakPipe |
| `robot` label accidentally removed | Low | Critical | CloakPipe integration tests | CloakPipe |
| Budget exhaustion from servers | Low | Medium | Per-source rate limits, caps | Both |
| Duplicate work on version changes | Medium | Low | Existing PR check (P2) | Homeostat |
| Extension regression | Low | Critical | Regression tests before deploy | Homeostat |

---

## Testing Strategy

### Unit Tests (Homeostat)
- ✅ `detectSource()` with extension labels
- ✅ `detectSource()` with WordPress labels
- ✅ `detectSource()` with VPS labels
- ✅ `parseServerIssue()` with WordPress template
- ✅ `parseServerIssue()` with VPS template
- ✅ `parseIssueBody()` dispatch (extension vs server)
- ✅ Synthetic breadcrumb generation
- ✅ Occurrence count parsing
- ✅ Title parser fallback (missing ErrorType)

### Integration Tests (Synthetic Issues)
- ✅ Create WordPress issue with `robot` label → Homeostat triggers
- ✅ Create VPS issue with `robot` label → Homeostat triggers
- ✅ Verify tier selection works for servers
- ✅ Verify PR creation works for servers
- ✅ Verify circuit breaker labels applied
- ✅ Verify extension behavior unchanged (regression)

### End-to-End Tests (CloakPipe Dev → Homeostat Dev)
- ✅ Trigger WordPress error → CloakPipe creates issue → Homeostat fixes
- ✅ Trigger VPS error → CloakPipe creates issue → Homeostat fixes
- ✅ Trigger extension error → verify unchanged behavior
- ✅ Verify Firefox/Safari extensions work (if ready)

### Production Monitoring (First 30 Days)
- 📊 WordPress fix success rate (target: >70%)
- 📊 VPS fix success rate (target: >70%)
- 📊 Extension fix success rate (target: unchanged)
- 📊 Parsing errors (target: 0%)
- 📊 Tier selection distribution (WordPress/VPS vs extensions)
- 📊 Budget consumption (servers vs extensions, within caps)
- 📊 Occurrence count distribution (WordPress: avg 3, VPS: avg 1)

---

## Coordination Requirements

### CloakPipe Team
- [ ] Confirm issue title format for WordPress/VPS (provide exact examples)
- [ ] Confirm ErrorType extraction logic (PHP/Node/Python exception mapping)
- [ ] Provide sample WordPress/VPS issues for Homeostat testing
- [ ] Coordinate deployment timing (Homeostat Week 1-2, CloakPipe Week 3-4)
- [ ] Verify `robot` label always present for errors (not feedback)
- [ ] Add integration tests for backward compatibility (extensions unchanged)

### Platform Team
- [ ] Create 3 new repos (cloudcode-wp-plugin, brand-copilot, auditor-toolkit)
- [ ] Grant Homeostat PAT access to new repos
- [ ] Configure GitHub Secrets in new repos (3 × 3 = 9 secrets)
- [ ] Set up branch protection rules (require status checks)
- [ ] Coordinate deployment schedule with Homeostat team

### Homeostat Team (This Repo)
- [ ] Implement parser updates (~10 hours)
- [ ] Install workflows in new repos
- [ ] Test with synthetic issues
- [ ] Coordinate with CloakPipe for E2E testing (Week 3)
- [ ] Monitor production fixes (Week 4+)
- [ ] Update documentation (CLOAKPIPE-INTEGRATION.md v2.0.0)

---

## Final Recommendations

### ✅ APPROVE CloakPipe Multi-Platform Extension Plan

**Conditions**:
1. **Confirm Title Format**: CloakPipe team must explicitly document WordPress/VPS issue title format before Homeostat parser implementation (see Verification Questions)
2. **Deployment Sequencing**: Homeostat updates MUST deploy before CloakPipe multi-platform (phased rollout: Homeostat Week 1-2, CloakPipe Week 3-4)
3. **Backward Compatibility Testing**: CloakPipe MUST verify extensions unchanged (robot label, title format, template structure)
4. **Coordination Window**: Allow 1 week for end-to-end testing between Homeostat updates and CloakPipe prod deploy

### ✅ HOMEOSTAT IS READY

**Implementation Path**:
- ~10 hours effort (low risk)
- Clear implementation plan (dual parser, source detection, workflow installation)
- Comprehensive test strategy (unit, integration, E2E)
- Phased deployment (4 weeks with gates)

**Backward Compatibility**: 100% for extensions (zero breaking changes)

**New Capabilities**: WordPress and VPS support with appropriate parsing and tier selection

---

## Next Actions

1. **Share this analysis** with CloakPipe team (Nathan in Platform)
2. **Confirm verification questions** (title format, ErrorType extraction)
3. **Coordinate deployment timeline** (Homeostat first, 1 week buffer, then CloakPipe)
4. **Begin Homeostat implementation** (Week 1 tasks: dual parser, tests, documentation)

---

## Appendix: Code Examples

### Synthetic WordPress Issue (For Testing)

```markdown
[cloudcode-wp-plugin] PHPException: Failed to backup database

**Summary:** Failed to backup database
**Occurrences:** 3 (first: 2025-10-29T10:00:00Z, last: 2025-10-29T10:15:00Z)
**Fingerprint:** abc123def456789
**Env:** prod • **Version:** 1.0.0 • **Runtime:** php
**Location:** backup.php:156
**Context:**
- **php_version**: 8.1.0
- **wp_version**: 6.4.0
- **component**: backup

**Stack Trace:**
```
#0 backup.php(156): backup_database()
#1 wp-cron.php(12): do_action('wp_backup')
```

**Autofix Suggestion:** tier2

---
*Automated report from CloakPipe Worker*
*Site ID (hashed): site123abc*
```

**Labels**: `robot`, `source:wordpress`, `cloudcode-wp-plugin`, `runtime:php`, `env:prod`, `type:error`, `severity:error`, `autofix:tier2`

### Synthetic VPS Issue (For Testing)

```markdown
[brandcopilot] UnhandledRejection: ECONNREFUSED

**Summary:** Unhandled promise rejection: ECONNREFUSED
**Occurrences:** 1 (first: 2025-10-29T14:00:00Z, last: 2025-10-29T14:00:00Z)
**Fingerprint:** xyz789abc123def
**Env:** prod • **Version:** 2.1.0 • **Runtime:** node • **Host:** vps-sydney-01
**Location:** scheduler.js:89
**Context:**
- **node_version**: 20.10.0
- **component**: scheduler
- **jobName**: daily-report
- **schedule**: 0 9 * * *

**Stack Trace:**
```
Error: ECONNREFUSED
    at TCPConnectWrap.afterConnect (node:net:1555:16)
    at scheduler.js:89:12
```

**Autofix Suggestion:** tier3

**Job Metadata:** Job: daily-report, Schedule: 0 9 * * *

---
*Automated report from CloakPipe Worker*
*VPS Host: vps-sydney-01*
```

**Labels**: `robot`, `source:vps`, `brandcopilot`, `runtime:node`, `env:prod`, `type:error`, `severity:fatal`, `autofix:tier3`, `component:scheduler`

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-29
**Next Review**: After Week 4 production deployment

*Generated with Claude Code (Homeostat Instance J) + GPT-5 DeepThink Analysis*
*Ready for Platform Team Review*
