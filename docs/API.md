# Homeostat API Documentation

## Overview

Homeostat is an automated bug-fixing system triggered by GitHub issues with the `robot` label. It receives error reports from [Logger](https://github.com/littlebearapps/logger), analyzes complexity, applies AI-powered fixes, validates with tests, and creates pull requests.

---

## Integration Contract

### Input: GitHub Issues (from Logger)

Homeostat processes GitHub issues that follow the Logger format (see [LOGGER-INTEGRATION.md](LOGGER-INTEGRATION.md)).

#### Required Labels
- `robot` (triggers Homeostat)
- Extension identifier: `notebridge`, `palettekit`, or `convert-my-file`

#### Issue Format

**Title**:
```
[ExtensionName] ErrorType: Error message
```

**Body** (Markdown):
```markdown
## Error Details
- Extension: ExtensionName v1.2.0
- Error Type: TypeError
- Message: Cannot read property 'sync' of undefined
- Timestamp: 2025-10-24T10:00:00Z
- Fingerprint: abc123def456

## Stack Trace
```
Error: Cannot read property 'sync' of undefined
    at syncNotes (background/sync.js:42:15)
    at <anonymous>:1:1
```

## Breadcrumbs
1. User clicked "Sync Now" button
2. Called syncNotes() function
3. Accessed chrome.storage.sync
4. Error thrown at background/sync.js:42

## User Description
(optional - manual reporting only)
```

#### Required Fields
| Field | Location | Format | Validated By |
|-------|----------|--------|--------------|
| Extension Name | Title | String | `parseIssueTitle()` |
| Error Type | Title + Body | String | `parseIssueBody()` |
| Stack Trace | Body | Code block | `extractCodeBlock()` |
| Timestamp | Body | ISO 8601 | `parseField()` |
| Fingerprint | Body | String | `parseField()` |
| Breadcrumbs | Body | Numbered list | `parseBreadcrumbs()` |

---

## Workflow Trigger

### GitHub Actions Event

Homeostat activates on:
```yaml
on:
  issues:
    types: [labeled]
```

**Condition**:
```javascript
if (github.event.label.name === 'robot') {
  // Process issue
}
```

---

## Processing Pipeline

### 1. Parse Issue
```typescript
import { parseLoggerIssue } from './homeostat/parsing/issue-parser';

const parsed = parseLoggerIssue(issue);
// Returns: { extensionName, errorType, stackTrace, fingerprint, breadcrumbs, ... }
```

### 2. Route to Tier
```typescript
import { selectModel } from './homeostat/routing/model-selector';

const routing = selectModel(parsed);
// Returns: { tier: 1|2|3, model: 'deepseek'|'gpt5', attempts: 1|2 }
```

**Tier Selection Logic**:
- **Tier 1 (70%)**: Stack depth <5, 1 file → DeepSeek ($0.001/fix, 2 attempts)
- **Tier 2 (25%)**: Stack depth 5-14, 2-3 files → DeepSeek + GPT-5 ($0.015/fix, 2 attempts)
- **Tier 3 (5%)**: Stack depth ≥15, ≥4 files, OR sensitive files → GPT-5 ($0.026/fix, 1 attempt)

### 3. Execute Fix
```typescript
import { executeFixAttempt } from './homeostat/execution/tier-executor';

const result = await executeFixAttempt(parsed, routing);
// Returns: { success: boolean, patch: string, tokens: {...}, cost: number }
```

### 4. Validate with Tests
```typescript
import { runTests } from './homeostat/execution/test-runner';

const testResult = await runTests();
// Returns: { passed: boolean, output: string }
```

### 5. Create PR (if tests pass)
```typescript
import { Octokit } from '@octokit/rest';

const pr = await octokit.pulls.create({
  owner: 'littlebearapps',
  repo: 'notebridge',
  title: `fix: automated fix for issue #${issueNumber}`,
  body: `Fixes #${issueNumber}\n\nAutomated fix (Tier ${routing.tier})`,
  head: `fix/issue-${issueNumber}`,
  base: 'main'
});
```

### 6. Update Issue
```typescript
await octokit.issues.createComment({
  issue_number: issueNumber,
  body: `✅ Fix deployed to PR #${pr.number}. Tests passing.`
});
```

---

## Output: Pull Requests

### PR Format

**Title**:
```
fix: automated fix for issue #123
```

**Body**:
```markdown
Fixes #123

## Summary
Automated fix for TypeError in background/sync.js

## Changes
- Added null check for chrome.storage.sync
- Updated error handling

## Tier
Tier 1 (DeepSeek)

## Testing
✅ All tests passing

---

🤖 Generated with Homeostat
```

### PR Labels
- `robot-generated`
- `tier-{1|2|3}`

---

## Cost Tracking

### Real-Time Cost API
```typescript
import { CostTracker } from './shared/cost/tracker';

const tracker = new CostTracker();

tracker.trackUsage({
  model: 'deepseek',
  inputTokens: 800,
  outputTokens: 400,
  issueNumber: 123,
  tier: 1
});

const metrics = tracker.exportMetrics();
console.log(`Projected annual cost: $${metrics.projectedAnnualCost}`);
```

### Budget Enforcement
- **Per-Fix Budget**: $0.01 max (throws error if exceeded)
- **Annual Target**: $9.28 for 1,000 fixes

---

## Metrics API

### Metrics Collection
```typescript
import { metrics } from './shared/observability/metrics';

metrics.recordFix(tier, success, cost);
metrics.recordRetry(escalated);
metrics.recordRedaction(type);

const report = metrics.exportJSON();
```

### Available Metrics
- Fixes: total, by tier, success/failure
- Retries: total, escalations
- Sanitization: redactions by type
- Cost: total, by tier

---

## Error Handling

### Issue Rejection Scenarios

| Scenario | Response | Label | Comment |
|----------|----------|-------|---------|
| Missing required field | Reject | `incomplete` | "⚠️ Missing required field: {field}" |
| Payload >100KB | Reject | - | No comment (silent rejection) |
| Invalid format | Reject | `parsing-error` | "⚠️ Invalid issue format. See docs." |
| Duplicate fingerprint | Skip | - | Comment on original issue |

### Fix Failure Scenarios

| Scenario | Action |
|----------|--------|
| Tests fail | Comment on issue, no PR |
| Malicious patch | Block, comment with reason |
| Budget exceeded | Throw error, halt |
| Rate limit | Retry with exponential backoff |

---

## Examples

See `docs/examples/` for complete code examples:
- `observability-integration.md` - Logging + metrics + alerts
- `tier-routing.md` - Custom tier selection logic

---

## References

- [Logger Integration Contract](LOGGER-INTEGRATION.md)
- [Privacy & Security Guide](PRIVACY-SECURITY-GUIDE.md)
- [SLO Definitions](SLOs.md)
- [Deployment Guide](DEPLOYMENT.md)
