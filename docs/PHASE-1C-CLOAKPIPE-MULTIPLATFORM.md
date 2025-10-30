# Phase 1C: CloakPipe Multi-Platform Integration

**Document Version**: 2.0.0
**Date**: 2025-10-29 (Updated after Week 0 completion)
**Status**: Week 0 Complete - Ready for Week 1 Implementation
**Timeline**: 5 weeks (Week 0 ✅ + Weeks 1-4)
**Homeostat Effort**: ~8.5 hours
**Platform Effort**: 2-3 hours (Week 0 ✅ COMPLETE)

---

## Executive Summary

**Objective**: Extend Homeostat to support CloakPipe's multi-platform expansion:
- ✅ **Chrome Extensions** (existing, 100% backward compatible)
- 🆕 **WordPress Plugin** (`wp-navigator-pro`, `wp-navigator-lite` - renamed from `claudecode-wordpress-mcp`)
- 🆕 **VPS Tools** (Brand Copilot: `brand-copilot`, Auditor Toolkit: `auditor-toolkit`)
- 🆕 **Cross-Browser** (Firefox, Safari, Edge - 100% compatible with existing parser)

**Verdict**: ✅ **APPROVED** by Platform Team (Instance M)

**Week 0 Status**: ✅ **COMPLETE**
- Repositories created (3 repos)
- Secrets configured (9 secrets: HOMEOSTAT_DEEPSEEK_API_KEY, HOMEOSTAT_OPENAI_API_KEY, HOMEOSTAT_PAT)
- Cloakpipe responses received (all 4 verification questions answered)
- Service Registry updated

**Key Changes Required**:
1. Dual parser (extension vs server template formats)
2. Source detection via labels (`source:wordpress`, `source:vps`, `source:cloakpipe`)
3. Synthetic breadcrumb generation for servers
4. Workflow installation in 3 new repositories
5. Integration testing with CloakPipe

**Backward Compatibility**: ✅ **100% CONFIRMED by Cloakpipe** - Zero breaking changes to existing Chrome extension support

**Risk Level**: 🟢 **LOW** - Well-defined scope, phased rollout, comprehensive testing, all prerequisites met

---

## Table of Contents

1. [Confirmed Details (from Cloakpipe)](#confirmed-details-from-cloakpipe)
2. [Background](#background)
3. [Technical Requirements](#technical-requirements)
4. [Implementation Tasks](#implementation-tasks)
5. [Deployment Timeline](#deployment-timeline)
6. [Testing Strategy](#testing-strategy)
7. [Success Criteria](#success-criteria)
8. [Risk Mitigation](#risk-mitigation)
9. [References](#references)

---

## Confirmed Details (from Cloakpipe)

**Source**: Platform verification questions answered by Cloakpipe (2025-10-29)

### Issue Title Format ✅ CONFIRMED

**Format**: `[{product}] {errorType}: {summary}` (exact match with Chrome extensions)

**Product Names**:
- **WordPress Pro**: `[wp-navigator-pro]` (matches repo: `littlebearapps/wp-navigator-pro`)
- **WordPress Lite**: `[wp-navigator-lite]` (matches repo: `littlebearapps/wp-navigator-lite`)
- **WordPress (deprecated)**: `[claudecode-wordpress-mcp]` (redirects to `wp-navigator-pro` for backward compat)
- **VPS Brand Copilot**: `[brand-copilot]` (matches GitHub repo name)
- **VPS Auditor Toolkit**: `[auditor-toolkit]` (matches GitHub repo name)
- **Chrome extensions**: `[convert-my-file]`, `[notebridge]`, `[palette-kit]`

**ErrorType Examples**:
- WordPress: `PDOException`, `RuntimeException`, `WP_Error`
- VPS Python: `ValueError`, `AttributeError`, `KeyError`
- VPS Node.js: `TypeError`, `UnhandledRejection`, `NetworkError`
- Chrome extensions: `TypeError`, `ReferenceError`, `NetworkError`

**Title Examples**:
```
[wp-navigator-pro] PDOException: Database connection failed
[wp-navigator-lite] TypeError: Cannot read property 'menuItems' of undefined
[brand-copilot] UnhandledRejection: ECONNREFUSED
[auditor-toolkit] ValueError: Invalid CSV format
[convert-my-file] TypeError: Cannot read property 'data' of undefined

# Backward compatibility (deprecated, redirects to wp-navigator-pro)
[claudecode-wordpress-mcp] PDOException: Database connection failed
```

### ErrorType Extraction Logic ✅ CONFIRMED

**All sources use native exception class names** (no generic "PHP Error" or "Python Error" prefixes):

- **WordPress PHP**: `get_class($exception)` → strip namespace → `PDOException`, `RuntimeException`
- **VPS Python**: `type(exception).__name__` → `ValueError`, `AttributeError`
- **VPS Node.js**: `error.constructor.name` → `TypeError`, `UnhandledRejection`
- **Chrome extensions**: `error.constructor.name` → `TypeError`, `ReferenceError`

### Server Issue Template Format ✅ CONFIRMED

**WordPress** (inline `**Field:** value` format):
```markdown
**Error Type:** PDOException
**Occurrences:** 3
**Site Hash:** abc123def456
**PHP Version:** 8.1.0
**WordPress Version:** 6.4.0
**Plugin Version:** 1.0.0
**Timestamp:** 2025-10-29T12:34:56Z
**Environment:** production

## Error Message
Database connection failed: SQLSTATE[HY000] [2002] Connection refused

## Stack Trace
{sanitized PHP stack trace}

## Context
{additional context}
```

**VPS** (inline `**Field:** value` format):
```markdown
**Error Type:** UnhandledRejection
**Occurrences:** 1
**Host:** vps-little-bear-apps-1
**Job:** daily-report
**Runtime:** Node.js v20.10.0
**Tool Version:** 1.0.0
**Timestamp:** 2025-10-29T03:00:00Z
**Environment:** production

## Error Message
ECONNREFUSED: Connection refused at 127.0.0.1:3306

## Stack Trace
{sanitized Node.js stack trace}

## Context
{cron job context, last successful run, etc.}
```

### Deployment Timing ✅ CONFIRMED

**Adjusted Sequence** (Homeostat deploys FIRST):
1. Week 1-2: Homeostat implements dual parser
2. **Week 3, Day 1-2**: Homeostat deploys to dev ← **FIRST**
3. **Week 3, Day 3**: Cloakpipe deploys to dev ← **AFTER Homeostat**
4. Week 3, Day 4-7: End-to-end testing
5. Week 4: Both deploy to prod

### Backward Compatibility ✅ CONFIRMED

**Preserved Labels** (Chrome extensions):
- ✅ `robot`, `hop:*`, `maxhop:3`, `source:cloakpipe`, `correlation:*`, `fingerprint:*`
- ✅ All extension product labels (`convert-my-file`, `notebridge`, `palette-kit`)
- ✅ Runtime labels (`runtime:chrome`, etc.)
- ✅ Surface labels (`surface:popup`, etc.)

**NEW Labels** (Server sources only - extensions won't see these):
- `source:wordpress` or `source:vps` (replaces `source:cloakpipe` for servers)
- `type:error` or `type:feedback`
- `severity:fatal|error|warn`
- `autofix:tier1|tier2|tier3`
- `env:prod|staging|dev`

**Preserved Title Format**: ✅ `[{product}] {errorType}: {summary}` (100% unchanged)

**Preserved Template**: ✅ All sections unchanged (`## Error Details`, `## Stack Trace`, `## Breadcrumbs`)

### Product Naming Convention ✅ CONFIRMED (Updated)

**Product IDs match GitHub repository names** for uniformity:

```yaml
- WordPress Pro: wp-navigator-pro       # Matches repo: littlebearapps/wp-navigator-pro
- WordPress Lite: wp-navigator-lite     # Matches repo: littlebearapps/wp-navigator-lite
- WordPress (deprecated): claudecode-wordpress-mcp  # Redirects to wp-navigator-pro
- Brand Copilot: brand-copilot         # Matches repo: littlebearapps/brand-copilot
- Auditor Toolkit: auditor-toolkit     # Matches repo: littlebearapps/auditor-toolkit
- Extensions: convert-my-file, notebridge, palette-kit
```

**Homeostat Usage**:
```typescript
// Parse issue title
const issueTitle = "[wp-navigator-pro] PDOException: Database error";
const productId = parseTitle(issueTitle); // "wp-navigator-pro"

// Product-to-repo mapping (from .homeostat/repos.yml)
const repoName = `littlebearapps/${productId}`; // "littlebearapps/wp-navigator-pro"

// Backward compatibility for old product name
if (productId === 'claudecode-wordpress-mcp') {
  repoName = 'littlebearapps/wp-navigator-pro'; // Redirect to Pro version
}

// Create PR in correct repo
await createPR(repoName, fixContent);
```

---

## Background

### Current State (Phase 1A Complete)

Homeostat currently supports Chrome extensions only:
- Parser expects `## Section` format (Error Details, Stack Trace, Breadcrumbs)
- Issues triggered by `robot` label
- Title format: `[ExtensionName] ErrorType: Error message`
- 230/230 tests passing, production-ready

### CloakPipe Multi-Platform Expansion

**Reference**: `/lba/tools/cloakpipe/main/docs/MULTI-PLATFORM-EXTENSION-PLAN.md`

CloakPipe is expanding to support:

1. **WordPress Plugins** (`wp-navigator-pro`, `wp-navigator-lite`)
   - Server-side PHP errors
   - WordPress-specific metadata (plugin version, WP version)
   - Inline template format: `**Field:** value`
   - **Note**: Renamed from `claudecode-wordpress-mcp` (backward compat maintained)

2. **VPS Tools**
   - Brand Copilot (Node.js, daily cron)
   - Auditor Toolkit (Python, weekly cron)
   - Server-side errors (no browser context)
   - Inline template format: `**Field:** value`

3. **Cross-Browser Extensions**
   - Firefox, Safari, Edge
   - Uses same `## Section` format as Chrome
   - **No Homeostat changes needed** (100% compatible)

### Platform Coordination (Week 0)

**Reference**: `/tmp/platform-feedback-to-homeostat.md`

Platform Team (Instance M) provides Week 0 preparation:
- Create 3 new GitHub repositories
- Configure GitHub Secrets (9 total: 3 repos × 3 secrets)
- Enable branch protection
- Confirm CloakPipe integration details
- Configure Healthchecks.io for VPS cron monitoring

---

## Technical Requirements

### 1. Dual Parser Architecture

**Problem**: Extensions use `## Section` format, servers use `**Field:** inline` format

**Solution**: Source detection + dual parser

```javascript
// shared/parsers/issue-parser.js

/**
 * Detect source type from issue labels
 * @param {Array<{name: string}>} labels - GitHub issue labels
 * @returns {'wordpress' | 'vps' | 'extension'} - Source type
 */
function detectSource(labels) {
  const labelNames = labels.map(l => l.name.toLowerCase());

  if (labelNames.includes('source:wordpress')) return 'wordpress';
  if (labelNames.includes('source:vps')) return 'vps';
  if (labelNames.includes('source:cloakpipe')) return 'extension';

  // Default: Extension (backward compatibility)
  return 'extension';
}

/**
 * Parse issue body based on source type
 * @param {string} body - GitHub issue body
 * @param {'wordpress' | 'vps' | 'extension'} source - Source type
 * @returns {ParsedIssue} - Structured issue data
 */
function parseIssueBody(body, source) {
  if (source === 'extension') {
    return parseExtensionIssue(body);  // Existing parser (unchanged)
  } else {
    return parseServerIssue(body);     // New parser
  }
}
```

### 2. Server Issue Parser

**New Function**: `parseServerIssue(body)`

```javascript
/**
 * Parse server issue (WordPress, VPS) with inline field format
 * Template: **Field:** value • value • value
 */
function parseServerIssue(body) {
  const parsed = {
    product: parseInlineField(body, 'Product'),
    summary: parseInlineField(body, 'Summary'),
    occurrences: parseInt(parseInlineField(body, 'Occurrences') || '1', 10),
    errorType: parseInlineField(body, 'Error Type'),
    fingerprint: parseInlineField(body, 'Fingerprint'),
    location: parseInlineField(body, 'Location'),
    stackTrace: extractCodeBlock(body),
    timestamp: parseInlineField(body, 'Timestamp'),
    version: parseInlineField(body, 'Version'),
    environment: parseInlineField(body, 'Environment'),
    context: parseInlineField(body, 'Context'),
  };

  // Generate synthetic breadcrumbs (servers don't have user action trail)
  parsed.breadcrumbs = generateSyntheticBreadcrumbs(parsed);

  return parsed;
}

/**
 * Parse inline field: **FieldName:** value • value • value
 * @param {string} body - Issue body
 * @param {string} fieldName - Field to extract
 * @returns {string | null} - First value (before •) or null
 */
function parseInlineField(body, fieldName) {
  const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n\\*\\*|\\n\\n|$)`, 'i');
  const match = body.match(regex);

  if (!match) return null;

  // Split on • and take first value
  const values = match[1].trim().split('•');
  return values[0].trim();
}

/**
 * Generate synthetic breadcrumbs for server errors
 * (Servers don't have user action trail like browser extensions)
 */
function generateSyntheticBreadcrumbs(parsed) {
  const breadcrumbs = [];

  if (parsed.location) {
    breadcrumbs.push(`Error in ${parsed.location}`);
  }

  if (parsed.context) {
    breadcrumbs.push(`Context: ${parsed.context}`);
  }

  if (parsed.errorType) {
    breadcrumbs.push(`Type: ${parsed.errorType}`);
  }

  // Fallback if no contextual info
  if (breadcrumbs.length === 0) {
    breadcrumbs.push('Server-side error (no user action trail)');
  }

  return breadcrumbs;
}
```

### 3. Backward Compatibility Guarantees

**Extensions (Chrome, Firefox, Safari, Edge)**:
- ✅ Existing `parseExtensionIssue()` function **unchanged**
- ✅ All 230 existing tests remain passing
- ✅ Title format unchanged: `[ExtensionName] ErrorType: Error message`
- ✅ Template structure unchanged: `## Section` format
- ✅ Required labels unchanged: `robot` (trigger), extension name
- ✅ Default source type: `extension` (if no `source:*` label)

**Preserved Labels** (used by Homeostat):
- `robot` - Triggers workflow
- `hop:0`, `hop:1`, `hop:2`, `hop:3` - Circuit breaker state
- `maxhop:3` - Circuit breaker limit
- `processing:homeostat` - Lock indicator
- `autofix:tier1`, `autofix:tier2`, `autofix:tier3` - AI tier suggestion
- `source:cloakpipe`, `source:wordpress`, `source:vps` - Source detection
- `correlation:*` - Error grouping
- `fingerprint:*` - Deduplication

**New Labels** (added by CloakPipe, used by Homeostat):
- `source:wordpress` - WordPress plugin error
- `source:vps` - VPS tool error
- Product labels: `wordpress-plugin`, `brand-copilot`, `auditor-toolkit`

### 4. Occurrence Count Handling

**WordPress**: CloakPipe waits for 3 occurrences before creating issue
- **Field**: `**Occurrences:** 3`
- **Parser**: `parseInt(parseInlineField(body, 'Occurrences') || '1', 10)`
- **Default**: 1 (if field missing)

**VPS Tools**: Typically 1 occurrence (cron jobs)
- **Field**: `**Occurrences:** 1`

**Extensions**: No occurrence count (1 error = 1 issue)
- **Default**: 1

**Usage**: Occurrence count logged for observability, does not affect tier selection

### 5. ErrorType Extraction

**Extensions**: Parsed from title
```javascript
// [NoteBridge] TypeError: Cannot read property 'foo' of undefined
const { errorType } = parseIssueTitle(issue.title);
// errorType = "TypeError"
```

**Servers**: Parsed from inline field
```javascript
// **Error Type:** PDOException • Database error
const errorType = parseInlineField(body, 'Error Type');
// errorType = "PDOException"
```

**Tier Selection**: Uses `errorType` for complexity analysis (unchanged logic)

---

## Implementation Tasks

### Week 0: Platform Preparation (Platform Team) ✅ COMPLETE

**Owner**: Platform Team (Instance M)
**Duration**: 2-3 hours
**Status**: ✅ **COMPLETE** (2025-10-29)

**Tasks**:
- [x] Create GitHub repositories ✅
  - `littlebearapps/wp-navigator-pro` (private) ✅ (renamed from `claudecode-wordpress-mcp`)
  - `littlebearapps/wp-navigator-lite` (private) ✅ (new)
  - `littlebearapps/brand-copilot` (private) ✅
  - `littlebearapps/auditor-toolkit` (private) ✅
- [x] Configure GitHub Secrets (all repos × 3 secrets each) ✅
  - `HOMEOSTAT_DEEPSEEK_API_KEY` in all 3 repos
  - `HOMEOSTAT_OPENAI_API_KEY` in all 3 repos
  - `HOMEOSTAT_PAT` in all 3 repos
- [x] Enable branch protection (main branch) ✅
  - Require PR reviews (1 approver)
  - Enforce for admins
  - No force pushes
- [x] Grant Homeostat PAT access ✅
  - Settings → Actions → General → Workflow permissions → Read and write
- [x] Add to Platform Service Registry ✅
  - Added services: `wp-navigator-pro`, `wp-navigator-lite`, `auditor-toolkit-github`
  - Deprecated: `claudecode-wordpress-mcp` (redirects to `wp-navigator-pro`)
- [x] Send confirmation questions to CloakPipe ✅
  - WordPress/VPS issue title format → CONFIRMED
  - ErrorType extraction logic → CONFIRMED (native exception class names)
  - Deployment timing coordination → CONFIRMED (Homeostat first)
  - Backward compatibility → CONFIRMED (100%)
- [ ] Configure Healthchecks.io monitors (P0, Week 2 task)
  - Brand Copilot: daily-report cron job
  - Auditor Toolkit: weekly audit cron job

**Gate**: ✅ **PASSED** - All repos created, secrets configured, Cloakpipe questions answered

---

### Week 1: Homeostat Preparation (Homeostat Team) 🚀 READY TO START

**Owner**: Homeostat Team (Instance J)
**Duration**: ~8.5 hours (P0 blocking work)
**Status**: 🚀 **READY TO START** - All prerequisites met, Cloakpipe confirmed

#### Task 1.1: Implement Dual Parser (2 hours)

**Files**:
- `shared/parsers/issue-parser.js` (modify existing)
- `shared/parsers/server-parser.js` (new)

**Subtasks**:
- [ ] Add `detectSource(issueLabels)` function
- [ ] Add `parseServerIssue(body)` function
- [ ] Update `parseIssueBody(body, source)` to route by source
- [ ] Add `parseInlineField(body, fieldName)` helper
- [ ] Add `generateSyntheticBreadcrumbs(parsed)` helper

**Validation**:
- Existing extension parser unchanged
- Unit tests for each new function

#### Task 1.2: Add Source Detection (30 minutes)

**Files**:
- `homeostat/orchestrator.js` (modify)

**Changes**:
```javascript
// Before fix attempt
const source = detectSource(issue.labels);
const parsed = parseIssueBody(issue.body, source);

console.log(`Detected source: ${source}`);
console.log(`Parsed product: ${parsed.product}`);
console.log(`Occurrences: ${parsed.occurrences}`);
```

**Validation**:
- Log output includes source type
- Metrics track source distribution

#### Task 1.3: Handle Optional Breadcrumbs (30 minutes)

**Files**:
- `shared/validators/issue-validator.js` (modify)

**Changes**:
```javascript
// Make breadcrumbs optional for servers
function validateParsedIssue(parsed, source) {
  const required = ['errorType', 'stackTrace', 'fingerprint'];

  // Extensions require breadcrumbs, servers don't
  if (source === 'extension') {
    required.push('breadcrumbs');
  }

  // Check all required fields present
  for (const field of required) {
    if (!parsed[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
}
```

**Validation**:
- Extension issues still require breadcrumbs
- Server issues don't require breadcrumbs

#### Task 1.4: Write Integration Tests (2 hours)

**Files**:
- `tests/integration/multi-platform-parsing.test.js` (new)

**Test Cases**:
```javascript
describe('Multi-Platform Issue Parsing', () => {
  test('detects WordPress source from labels', () => {
    const labels = [{ name: 'source:wordpress' }, { name: 'robot' }];
    expect(detectSource(labels)).toBe('wordpress');
  });

  test('detects VPS source from labels', () => {
    const labels = [{ name: 'source:vps' }, { name: 'robot' }];
    expect(detectSource(labels)).toBe('vps');
  });

  test('defaults to extension source', () => {
    const labels = [{ name: 'robot' }];
    expect(detectSource(labels)).toBe('extension');
  });

  test('parses WordPress issue with inline fields', () => {
    const body = `**Product:** CloudCode WordPress Plugin
**Summary:** Database connection failed
**Occurrences:** 3
**Error Type:** PDOException
**Fingerprint:** db-conn-fail-123
...`;

    const parsed = parseServerIssue(body);
    expect(parsed.product).toBe('CloudCode WordPress Plugin');
    expect(parsed.occurrences).toBe(3);
    expect(parsed.errorType).toBe('PDOException');
  });

  test('parses VPS issue with inline fields', () => {
    const body = `**Product:** Brand Copilot
**Summary:** Failed to fetch brand data
**Occurrences:** 1
...`;

    const parsed = parseServerIssue(body);
    expect(parsed.product).toBe('Brand Copilot');
    expect(parsed.occurrences).toBe(1);
  });

  test('generates synthetic breadcrumbs for servers', () => {
    const parsed = {
      location: 'api/fetch-brands.js:45',
      context: 'Daily brand sync',
      errorType: 'NetworkError'
    };

    const breadcrumbs = generateSyntheticBreadcrumbs(parsed);
    expect(breadcrumbs).toContain('Error in api/fetch-brands.js:45');
    expect(breadcrumbs).toContain('Context: Daily brand sync');
  });

  test('existing extension parsing unchanged', () => {
    const body = `## Error Details
Extension: NoteBridge
...`;

    const parsed = parseExtensionIssue(body);
    // All existing assertions pass
  });
});
```

**Validation**:
- All new tests pass
- All 230 existing tests still pass (100% backward compat)

#### Task 1.5: Update Documentation (1 hour)

**Files**:
- `docs/CLOAKPIPE-INTEGRATION.md` (update to v2.0.0)

**Changes**:
- Add "Multi-Platform Support" section
- Document server template format
- Document source detection logic
- Document synthetic breadcrumbs
- Update examples with WordPress/VPS

**Validation**:
- Documentation review by Platform team

#### Task 1.6: Deploy to Dev Environment (30 minutes)

**Actions**:
```bash
# In Homeostat repo
git checkout -b feature/multi-platform-support
git add .
git commit -m "feat: add multi-platform support for WordPress/VPS"
git push -u origin feature/multi-platform-support

# Create PR, merge to main
# GitHub Actions deploys to dev environment
```

**Validation**:
- Dev deployment successful
- All tests passing in CI/CD

**Gate**: All tests passing (230+ tests), dev deployment successful

---

### Week 2: Repository Setup & Testing (Homeostat Team)

**Owner**: Homeostat Team (Instance J)
**Duration**: ~3 hours
**Status**: Starts after Week 1 complete

#### Task 2.1: Install Homeostat Workflows (2 hours)

**Files to Create** (in each of 3 repos):
- `.github/workflows/homeostat.yml`

**Actions**:
```bash
# For each repo: wp-navigator-pro, wp-navigator-lite, brand-copilot, auditor-toolkit

# 1. Clone repo (example: wp-navigator-pro)
git clone git@github.com:littlebearapps/wp-navigator-pro.git
cd wp-navigator-pro

# 2. Copy Homeostat workflow
mkdir -p .github/workflows
cp ~/claude-code-tools/lba/tools/homeostat/main/.github/workflows/multi-repo-orchestrator.yml \
   .github/workflows/homeostat.yml

# 3. Update workflow (if needed)
# Verify secrets match: DEEPSEEK_API_KEY, OPENAI_API_KEY, HOMEOSTAT_PAT

# 4. Commit and push
git add .github/workflows/homeostat.yml
git commit -m "feat: add Homeostat auto-fix workflow"
git push

# 5. Test workflow trigger
# Settings → Actions → Enable workflows
# Create test issue with 'robot' label, verify workflow runs
```

**Validation** (per repo):
- Workflow file committed
- Workflow enabled in GitHub Actions
- Test trigger succeeds (workflow runs, even if fix fails)

#### Task 2.2: Test with Synthetic Issues (1 hour)

**Create Test Issues** (in each repo):

1. **WordPress Test Issue** (`claudecode-wordpress-mcp`):
```markdown
Title: [CloudCode WP Plugin] PDOException: Database connection failed

Labels: robot, source:wordpress, wordpress-plugin

Body:
**Product:** CloudCode WordPress Plugin
**Summary:** Failed to connect to MySQL database
**Occurrences:** 3
**Error Type:** PDOException
**Fingerprint:** db-conn-fail-wp-123
**Location:** includes/database.php:45
**Timestamp:** 2025-10-29T10:30:00Z
**Version:** 1.2.0
**Environment:** production
**Context:** User initiated backup operation

## Stack Trace
```
PDOException: SQLSTATE[HY000] [2002] Connection refused
  at includes/database.php:45
  at includes/backup.php:120
```

**Expected Behavior**: Homeostat parses successfully, attempts fix

2. **VPS Test Issue** (`brand-copilot`):
```markdown
Title: [Brand Copilot] NetworkError: Failed to fetch brand data

Labels: robot, source:vps, brand-copilot

Body:
**Product:** Brand Copilot
**Summary:** API request timeout when fetching brand info
**Occurrences:** 1
**Error Type:** NetworkError
**Fingerprint:** fetch-timeout-bc-456
**Location:** api/fetch-brands.js:78
**Timestamp:** 2025-10-29T03:00:00Z
**Version:** 2.1.3
**Environment:** production
**Context:** Daily cron job (3am)

## Stack Trace
```
NetworkError: Request timeout after 30s
  at api/fetch-brands.js:78
  at cron/daily-sync.js:34
```

**Expected Behavior**: Homeostat parses successfully, attempts fix

**Validation**:
- Homeostat workflow triggers on both issues
- Parser correctly detects source type
- Synthetic breadcrumbs generated
- Tier selection works (even if fix fails - that's expected for synthetic issues)

**Gate**: Homeostat successfully processes synthetic WordPress/VPS issues (workflow runs, parsing succeeds)

---

### Week 3: CloakPipe Integration Testing (Joint Effort)

**Owners**: CloakPipe Team (Instance I) + Homeostat Team (Instance J)
**Duration**: ~3 days
**Status**: Starts after Week 2 complete

#### Task 3.1: CloakPipe Dev Deployment (CloakPipe Team)

**Actions** (by CloakPipe):
- Deploy multi-platform support to dev environment
- Configure WordPress plugin to report to `claudecode-wordpress-mcp` repo
- Configure VPS tools to report to respective repos
- Verify label emission (`source:*`, product labels)

**Validation**:
- CloakPipe dev creates issues with correct labels
- Issues appear in correct repositories

#### Task 3.2: End-to-End Testing (Joint)

**Test Scenarios**:

1. **WordPress Error Flow**:
   - Trigger WordPress error (dev environment)
   - CloakPipe creates issue in `claudecode-wordpress-mcp` repo
   - Homeostat workflow triggers
   - Parser detects `source:wordpress`
   - Fix attempted, PR created
   - Validate PR quality

2. **VPS Error Flow**:
   - Trigger Brand Copilot error (dev)
   - CloakPipe creates issue in `brand-copilot` repo
   - Homeostat workflow triggers
   - Parser detects `source:vps`
   - Fix attempted, PR created
   - Validate PR quality

3. **Extension Error Flow** (regression test):
   - Trigger extension error (dev)
   - CloakPipe creates issue in extension repo
   - Homeostat workflow triggers
   - Parser detects `source:extension` (default)
   - Fix attempted, PR created
   - Validate backward compatibility

**Validation**:
- All 3 flows complete successfully
- No parsing errors
- PR quality acceptable (>70% fix rate target)

#### Task 3.3: Fix Integration Issues (Joint)

**Common Issues**:
- Title format mismatch → Update parser regex
- Missing fields → Add fallbacks
- Label discrepancies → Coordinate with CloakPipe
- Tier selection inaccurate → Tune complexity thresholds

**Actions**:
- Log all parsing errors
- Coordinate fixes between CloakPipe and Homeostat
- Redeploy both services to dev

**Gate**: End-to-end flow works (CloakPipe dev → Homeostat dev → PR created) with >70% success rate

---

### Week 4: Production Rollout (Joint Effort)

**Owners**: CloakPipe Team + Homeostat Team + Platform Team
**Duration**: 1 week (monitoring phase extends 3 weeks)
**Status**: Starts after Week 3 gate passed

#### Task 4.1: Homeostat Production Deployment (Homeostat Team)

**Actions**:
```bash
# Merge multi-platform support to main
git checkout main
git merge feature/multi-platform-support
git push

# Tag release
git tag v1.2.0 -m "feat: multi-platform support (WordPress, VPS)"
git push --tags
```

**Validation**:
- Production deployment successful
- All tests passing in CI/CD
- Monitoring shows healthy state

#### Task 4.2: CloakPipe Production Deployment (CloakPipe Team)

**Actions** (by CloakPipe):
- Deploy multi-platform support to production
- Enable WordPress plugin error reporting
- Enable VPS error reporting
- Monitor label emission

**Validation**:
- Production errors create issues with correct labels
- Issues routed to correct repositories

#### Task 4.3: Monitor First 10-20 Fixes (All Teams)

**Monitoring Period**: 3-4 weeks (depends on error volume)

**Metrics to Track**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| WordPress fix success rate | >70% | TBD | 🟡 |
| VPS fix success rate | >70% | TBD | 🟡 |
| Extension fix success rate | 100% (no regression) | TBD | 🟡 |
| Tier distribution | 60-80% T1, 20-40% T2, 0-20% T3 | TBD | 🟡 |
| Cost per fix (avg) | <$0.10 | TBD | 🟡 |
| Parsing errors | 0% | TBD | 🟡 |

**Actions**:
- Review each PR created (first 10 fixes per source)
- Log tier selection accuracy
- Track cost per fix
- Document parsing issues
- Tune thresholds if needed

**Learnings Documentation**:
- Create `docs/WORDPRESS-LEARNINGS.md`
- Create `docs/VPS-LEARNINGS.md`
- Update `docs/CONVERT-MY-FILE-LEARNINGS.md` (extensions)

**Gate**: >70% fix success rate for WordPress/VPS, 100% (no regressions) for extensions

---

## Testing Strategy

### 1. Unit Tests (New)

**File**: `tests/unit/server-parser.test.js`

**Coverage**:
- `detectSource()` - 100% coverage (3 source types + default)
- `parseServerIssue()` - 100% coverage (all fields)
- `parseInlineField()` - 100% coverage (multi-value, missing field)
- `generateSyntheticBreadcrumbs()` - 100% coverage (all combinations)

**Target**: 100% coverage on new functions

### 2. Integration Tests (New)

**File**: `tests/integration/multi-platform-parsing.test.js`

**Coverage**:
- Source detection from labels
- WordPress issue parsing (end-to-end)
- VPS issue parsing (end-to-end)
- Extension parsing unchanged (regression)
- Synthetic breadcrumb quality

**Target**: All source types tested

### 3. Regression Tests (Existing)

**Files**: All 230 existing tests

**Validation**:
- ✅ All tests still pass (100% backward compatibility)
- ✅ Extension parsing unchanged
- ✅ Tier selection unchanged
- ✅ PII sanitization unchanged

**Target**: 230/230 tests passing (100%)

### 4. End-to-End Tests (Week 3)

**Environment**: Dev environment

**Scenarios**:
- Real WordPress error → CloakPipe → Homeostat → PR
- Real VPS error → CloakPipe → Homeostat → PR
- Real extension error → CloakPipe → Homeostat → PR (regression)

**Target**: All 3 flows complete successfully

### 5. Production Validation (Week 4)

**Monitoring**: First 10-20 fixes per source type

**Metrics**:
- Fix success rate >70% (WordPress, VPS)
- Fix success rate 100% (extensions, no regression)
- Zero parsing errors
- Cost per fix <$0.10

**Target**: All metrics met

---

## Success Criteria

### Week 0 (Platform Prep)
- ✅ 3 repos created with correct visibility (private)
- ✅ 9 GitHub Secrets configured (3 repos × 3 secrets)
- ✅ Branch protection enabled (main branch, require PR reviews)
- ✅ Homeostat PAT has access to all 3 repos
- ✅ Platform Service Registry updated (3 new services)
- ✅ CloakPipe confirmation questions answered

### Week 1 (Homeostat Prep)
- ✅ Dual parser implemented (extension vs server)
- ✅ Source detection implemented
- ✅ Synthetic breadcrumbs implemented
- ✅ Integration tests written and passing
- ✅ Documentation updated (CLOAKPIPE-INTEGRATION.md v2.0.0)
- ✅ All 230+ tests passing (100% backward compat)
- ✅ Dev deployment successful

### Week 2 (Repository Setup)
- ✅ Homeostat workflows installed in 3 repos
- ✅ Workflows enabled and tested
- ✅ Synthetic issues parsed successfully
- ✅ WordPress parsing works
- ✅ VPS parsing works

### Week 3 (CloakPipe Integration)
- ✅ CloakPipe dev deployed
- ✅ End-to-end testing complete (all 3 source types)
- ✅ Integration issues resolved
- ✅ >70% fix success rate in dev environment

### Week 4 (Production)
- ✅ Homeostat production deployed
- ✅ CloakPipe production deployed
- ✅ First 10-20 fixes monitored
- ✅ >70% fix success rate (WordPress, VPS)
- ✅ 100% fix success rate (extensions, no regression)
- ✅ Zero parsing errors
- ✅ Cost per fix <$0.10

---

## Risk Mitigation

### Risk Matrix

| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|-----------|-------|
| Repos not created before Week 1 | ~~High~~ **ZERO** | High | Platform creates in Week 0 | Platform ✅ |
| CloakPipe title format differs from plan | Medium | High | Platform confirms with CloakPipe in Week 0 | Platform |
| Parsing errors on production data | Medium | Medium | Extensive testing in Week 2-3, fallback defaults | Homeostat |
| Tier selection inaccurate for server errors | Medium | Low | Monitor first 10 fixes, tune thresholds | Homeostat |
| Extension regression (backward compat) | Low | **Critical** | 230 regression tests, all must pass | Homeostat |
| GitHub Secrets misconfigured | ~~Medium~~ **ZERO** | High | Platform configures in Week 0, validates access | Platform ✅ |
| VPS cron jobs fail (no errors reach Homeostat) | Low | Medium | Platform monitors via Healthchecks.io | Platform |
| Cost exceeds budget ($9.28/year) | Low | Medium | Track cost per fix, tune tier selection | Homeostat |

### Rollback Plan

**If Week 3 E2E testing fails**:
1. Revert Homeostat to previous version (pre-multi-platform)
2. CloakPipe continues supporting extensions only
3. Debug parsing issues in dev environment
4. Retry Week 3 after fixes

**If Week 4 production has >30% failure rate**:
1. Keep Homeostat deployed (extensions still work)
2. Disable WordPress/VPS error reporting in CloakPipe
3. Analyze failed fixes, improve parser
4. Re-enable after fixes validated in dev

**Backward Compatibility Safety**:
- Extensions always default source type
- Existing parser code unchanged
- All 230 tests must pass before merge

---

## References

### CloakPipe Documentation
- **Multi-Platform Plan**: `/lba/tools/cloakpipe/main/docs/MULTI-PLATFORM-EXTENSION-PLAN.md`
- **Issue Templates**: CloakPipe plan lines 732-800
- **Label Taxonomy**: CloakPipe plan lines 367-495

### Platform Documentation
- **Week 0 Completion**: `/tmp/platform-week0-complete-homeostat.md`
- **Platform Response**: `/tmp/platform-response-to-homeostat.md` (Cloakpipe answers included)
- **Feedback**: `/tmp/platform-feedback-to-homeostat.md`
- **Service Registry**: Platform manages automatically
- **Healthchecks.io**: Platform configures VPS cron monitoring

**Platform Metrics Integration** (P2 - Optional Post-Deploy Enhancement):
- **Endpoint**: `https://platform-alert-router.littlebearapps.workers.dev/metrics/homeostat`
- **Payload**: See Platform response document for complete `HomeOstatMetric` interface
- **Dashboard**: Platform Infrastructure tab will show fix success rates by source

### Cloakpipe Documentation
- **Multi-Platform Plan**: `/lba/tools/cloakpipe/main/docs/MULTI-PLATFORM-EXTENSION-PLAN.md`
- **Platform Response**: `/lba/tools/cloakpipe/main/docs/PLATFORM-QUESTIONS-RESPONSE.md`
- **Verification Questions**: `/tmp/platform-questions-to-cloakpipe.md`

### Homeostat Documentation
- **Integration Contract**: `docs/CLOAKPIPE-INTEGRATION.md` (will update to v2.0.0 in Week 1)
- **Compatibility Analysis**: `docs/CLOAKPIPE-MULTIPLATFORM-COMPATIBILITY-ANALYSIS.md`
- **Implementation Roadmap**: `docs/IMPLEMENTATION-ROADMAP.md`
- **Phase 1B Plan**: `docs/PHASE-1B-IMPLEMENTATION-PLAN.md` (deferred)

### Cloakpipe Verification Questions ✅ ANSWERED

**Platform coordinated answers in Week 0** (all confirmed 2025-10-29):

1. **WordPress/VPS Issue Title Format** ✅ CONFIRMED
   - Format: `[{product}] {errorType}: {summary}` (exact match)
   - Products: `claudecode-wordpress-mcp`, `brand-copilot`, `auditor-toolkit`
   - ErrorTypes: Native exception class names (e.g., `PDOException`, `ValueError`)

2. **ErrorType Extraction** ✅ CONFIRMED
   - WordPress PHP: `get_class($exception)` → `PDOException`
   - VPS Python: `type(exception).__name__` → `ValueError`
   - VPS Node.js: `error.constructor.name` → `TypeError`

3. **Deployment Timing** ✅ CONFIRMED
   - Week 3, Day 1-2: Homeostat deploys to dev FIRST
   - Week 3, Day 3: Cloakpipe deploys to dev AFTER
   - Week 3, Day 4-7: E2E testing
   - Week 4: Both deploy to prod

4. **Backward Compatibility Testing** ✅ CONFIRMED
   - All labels preserved (`robot`, `hop:*`, `maxhop:3`, `source:cloakpipe`, etc.)
   - Title format unchanged
   - Template structure unchanged
   - 100% backward compatible

---

## Appendix: Code Examples

### Complete Dual Parser Implementation

```javascript
// shared/parsers/issue-parser.js

/**
 * Main entry point - parse GitHub issue based on source type
 */
export function parseGitHubIssue(issue) {
  const source = detectSource(issue.labels);
  const parsed = parseIssueBody(issue.body, source);

  // Add metadata
  parsed.source = source;
  parsed.issueNumber = issue.number;
  parsed.repository = issue.repository.name;

  // Validate
  validateParsedIssue(parsed, source);

  return parsed;
}

/**
 * Detect source type from labels
 */
export function detectSource(labels) {
  const labelNames = labels.map(l => l.name.toLowerCase());

  if (labelNames.includes('source:wordpress')) return 'wordpress';
  if (labelNames.includes('source:vps')) return 'vps';
  if (labelNames.includes('source:cloakpipe')) return 'extension';

  return 'extension';  // Default for backward compatibility
}

/**
 * Route to appropriate parser based on source
 */
function parseIssueBody(body, source) {
  if (source === 'extension') {
    return parseExtensionIssue(body);  // Existing parser (unchanged)
  } else {
    return parseServerIssue(body);     // New parser
  }
}

/**
 * Parse extension issue (Chrome, Firefox, Safari, Edge)
 * Template: ## Section format
 * UNCHANGED from Phase 1A
 */
function parseExtensionIssue(body) {
  // Existing implementation (230 tests depend on this)
  const sections = {
    errorDetails: extractSection(body, '## Error Details'),
    stackTrace: extractSection(body, '## Stack Trace'),
    breadcrumbs: extractSection(body, '## Breadcrumbs'),
  };

  return {
    extension: extractField(sections.errorDetails, 'Extension'),
    errorType: extractField(sections.errorDetails, 'Error Type'),
    message: extractField(sections.errorDetails, 'Message'),
    stackTrace: sections.stackTrace,
    fingerprint: extractField(sections.errorDetails, 'Fingerprint'),
    breadcrumbs: parseBreadcrumbs(sections.breadcrumbs),
    timestamp: extractField(sections.errorDetails, 'Timestamp'),
    version: extractField(sections.errorDetails, 'Version'),
  };
}

/**
 * Parse server issue (WordPress, VPS)
 * Template: **Field:** inline format
 * NEW for Phase 1C
 */
function parseServerIssue(body) {
  const parsed = {
    product: parseInlineField(body, 'Product'),
    summary: parseInlineField(body, 'Summary'),
    occurrences: parseInt(parseInlineField(body, 'Occurrences') || '1', 10),
    errorType: parseInlineField(body, 'Error Type'),
    fingerprint: parseInlineField(body, 'Fingerprint'),
    location: parseInlineField(body, 'Location'),
    stackTrace: extractCodeBlock(body),
    timestamp: parseInlineField(body, 'Timestamp'),
    version: parseInlineField(body, 'Version'),
    environment: parseInlineField(body, 'Environment'),
    context: parseInlineField(body, 'Context'),
  };

  // Generate synthetic breadcrumbs (servers don't have user actions)
  parsed.breadcrumbs = generateSyntheticBreadcrumbs(parsed);

  return parsed;
}

/**
 * Parse inline field: **FieldName:** value • value • value
 */
function parseInlineField(body, fieldName) {
  const regex = new RegExp(
    `\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n\\*\\*|\\n\\n|$)`,
    'i'
  );
  const match = body.match(regex);

  if (!match) return null;

  // Split on • and take first value
  const values = match[1].trim().split('•');
  return values[0].trim();
}

/**
 * Generate synthetic breadcrumbs for server errors
 */
function generateSyntheticBreadcrumbs(parsed) {
  const breadcrumbs = [];

  if (parsed.location) {
    breadcrumbs.push(`Error in ${parsed.location}`);
  }

  if (parsed.context) {
    breadcrumbs.push(`Context: ${parsed.context}`);
  }

  if (parsed.errorType) {
    breadcrumbs.push(`Type: ${parsed.errorType}`);
  }

  if (breadcrumbs.length === 0) {
    breadcrumbs.push('Server-side error (no user action trail)');
  }

  return breadcrumbs;
}

/**
 * Extract code block (stack trace)
 */
function extractCodeBlock(body) {
  const match = body.match(/```[\s\S]*?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/**
 * Validate parsed issue has all required fields
 */
function validateParsedIssue(parsed, source) {
  const required = ['errorType', 'stackTrace', 'fingerprint'];

  // Extensions require breadcrumbs, servers don't
  if (source === 'extension') {
    required.push('breadcrumbs');
  }

  for (const field of required) {
    if (!parsed[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
}
```

---

**Document Status**: Ready for Implementation
**Next Review**: After Week 0 completion (repos created, CloakPipe confirmation received)
**Contact**: Homeostat Team (Instance J), Platform Team (Instance M), CloakPipe Team (Instance I)
