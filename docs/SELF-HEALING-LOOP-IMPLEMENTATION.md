# Homeostat - Implementation Plan (Legacy)

**Status**: Planning Phase (Legacy - see IMPLEMENTATION-ROADMAP.md for current plan)
**Estimated Implementation**: 20-30 hours
**ROI**: Compounding long-term value, competitive differentiation
**Priority**: HIGH (Alternative to custom analytics module)
**Note**: This document contains the original "Self-Healing Loop" implementation plan. Current implementation uses updated architecture in IMPLEMENTATION-ROADMAP.md and DEEPSEEK-MULTI-AI-ARCHITECTURE.md.

---

## 🎯 Executive Summary

### What Is This?

A fully automated system that transforms production errors into merged pull requests:

```
Error in Production
  → Logger captures & fingerprints
  → GitHub Issue created automatically
  → AI agent analyzes & proposes fix
  → Automated testing & validation
  → Auto-merge (safe changes only) OR human review
  → Canary deployment with auto-rollback
```

### Why Build This Instead of Custom Analytics?

**Financial Comparison**:
- Custom analytics: $20k-30k Year 1, $9,600-14,400/year ongoing
- Self-healing loop: 20-30 hours (~$2,000-3,000) one-time
- **Savings**: $37k-56k over 3 years invested in product features

**Strategic Value**:
- ✅ **Compounding**: Gets better over time as AI improves
- ✅ **Differentiation**: Competitors don't have this (yet)
- ✅ **Leverage**: Works 24/7 fixing issues while you sleep
- ✅ **Scalability**: Handles 3 extensions now, 30+ later
- ✅ **Innovation**: Cuts time-to-fix from days → hours

**Analytics Alternative**: Keep Plausible ($720/year) for tracking

---

## 🏗️ Architecture Overview

### High-Level Flow

```
┌─────────────────┐
│ Chrome Extension│
│ (NoteBridge)    │
└────────┬────────┘
         │ Error occurs
         ▼
┌─────────────────┐
│ Error Logger    │
│ (client-side)   │
│ • Capture       │
│ • Fingerprint   │
│ • Deduplicate   │
└────────┬────────┘
         │ reportToGitHub()
         ▼
┌─────────────────────┐
│ Cloudflare Worker   │
│ • Rate limiting     │
│ • PII sanitization  │
│ • Quota enforcement │
└────────┬────────────┘
         │ GitHub API
         ▼
┌─────────────────────────┐
│ GitHub Issue            │
│ • Template applied      │
│ • Labels: auto-triage   │
│ • Metadata: fingerprint │
└────────┬────────────────┘
         │ Webhook trigger
         ▼
┌────────────────────────────┐
│ GitHub Actions Workflow    │
│ • Parse error metadata     │
│ • Check if auto-fixable    │
│ • Route to AI agent        │
└────────┬───────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌─────────┐
│ Codex   │ │ Claude  │
│ Cloud   │ │ API     │
│ (GPT-5) │ │ (Opus)  │
└────┬────┘ └────┬────┘
     │           │
     └─────┬─────┘
           ▼
┌───────────────────────┐
│ AI Agent Fix Proposal │
│ • Analyze error       │
│ • Generate fix        │
│ • Write tests         │
│ • Create PR           │
└────────┬──────────────┘
         │
         ▼
┌─────────────────────────┐
│ Automated Validation    │
│ • Run test suite        │
│ • TypeScript type check │
│ • Linting               │
│ • Bundle size check     │
└────────┬────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ Safe    │ │ Needs Human  │
│ Changes │ │ Review       │
└────┬────┘ └──────┬───────┘
     │             │
     │             ▼
     │      ┌─────────────┐
     │      │ Notify User │
     │      │ (Slack/     │
     │      │  Linear)    │
     │      └─────────────┘
     ▼
┌─────────────────┐
│ Auto-merge      │
│ • Squash commit │
│ • Deploy canary │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ Canary Deployment   │
│ • 5% rollout        │
│ • Error monitoring  │
│ • Auto-rollback     │
└────────┬────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌─────────┐
│ Success │ │ Failed  │
│ → 100%  │ │ → Revert│
└─────────┘ └─────────┘
```

### Key Components

1. **Error Fingerprinting** (Client-side)
2. **Issue Creation Pipeline** (Cloudflare Worker + GitHub API)
3. **AI Agent Orchestration** (GitHub Actions)
4. **Safety Gates & Policy Engine** (Custom logic)
5. **Automated Testing & Validation** (CI/CD)
6. **Canary Deployment System** (Chrome Web Store API)
7. **Monitoring & Rollback** (Logger + alerts)

---

## 📦 Component Design

### Component 1: Error Fingerprinting (Client-side)

**Purpose**: Deduplicate errors so same issue doesn't create 100 GitHub issues

**Implementation** (`shared/error-logger.js`):

```javascript
function generateFingerprint(error) {
  // Normalize stack trace (remove dynamic parts)
  const normalizedStack = error.stack
    .replace(/:\d+:\d+/g, ':XX:XX')           // Remove line:col numbers
    .replace(/chrome-extension:\/\/[^/]+/g, 'chrome-extension://<ID>')
    .replace(/\d{13,}/g, '<TIMESTAMP>')       // Remove timestamps
    .replace(/[0-9a-f-]{36}/g, '<UUID>');     // Remove UUIDs

  // Create fingerprint from: error type + normalized stack + surface
  const fingerprintString = `${error.type}|${normalizedStack}|${metadata.surface}`;

  // SHA-256 hash (first 16 chars for readability)
  return sha256(fingerprintString).substring(0, 16);
}

async function reportToGitHub(errorId, userDescription = '') {
  const errorEntry = await this.getError(errorId);
  const fingerprint = generateFingerprint(errorEntry.error);

  // Check if we've already reported this fingerprint in last 7 days
  const recentIssues = await chrome.storage.local.get('reported_fingerprints');
  const reportedFingerprints = recentIssues.reported_fingerprints || {};

  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  if (reportedFingerprints[fingerprint] && reportedFingerprints[fingerprint] > sevenDaysAgo) {
    throw new Error('This error has already been reported recently. Check existing GitHub issues.');
  }

  // Include fingerprint in GitHub issue metadata
  const payload = {
    title: `[${errorEntry.metadata.extension}] ${errorEntry.error.type}: ${errorEntry.error.message}`,
    body: issueBody,
    fingerprint: fingerprint,  // NEW: Add to payload
    // ... rest of payload
  };

  // ... send to worker ...

  // Store fingerprint with timestamp
  reportedFingerprints[fingerprint] = now;
  await chrome.storage.local.set({ reported_fingerprints: reportedFingerprints });
}
```

**Web Crypto API for SHA-256** (no dependencies):

```javascript
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Storage Cleanup** (Chrome Alarms):

```javascript
// Clean up old fingerprints (keep only 30 days)
chrome.alarms.create('cleanup-fingerprints', { periodInMinutes: 1440 }); // Daily

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup-fingerprints') {
    const { reported_fingerprints } = await chrome.storage.local.get('reported_fingerprints');
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    const cleaned = Object.fromEntries(
      Object.entries(reported_fingerprints || {})
        .filter(([fp, timestamp]) => timestamp > thirtyDaysAgo)
    );

    await chrome.storage.local.set({ reported_fingerprints: cleaned });
  }
});
```

---

### Component 2: GitHub Issue Creation (Worker Enhancement)

**Update** `worker/src/worker.ts`:

```typescript
// Add fingerprint to issue labels
const labels = [
  'auto-triage',
  `surface:${metadata.surface}`,
  `extension:${metadata.extension}`,
  `fingerprint:${payload.fingerprint.substring(0, 8)}`  // First 8 chars for label length
];

// Store full fingerprint in issue body (machine-readable section)
const machineReadableMetadata = `
<!-- AUTO-TRIAGE-METADATA
fingerprint: ${payload.fingerprint}
extension: ${metadata.extension}
version: ${metadata.version}
surface: ${metadata.surface}
timestamp: ${new Date().toISOString()}
-->
`;

const issueBody = `${payload.body}\n\n${machineReadableMetadata}`;

// Create GitHub issue with labels
const githubResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
  method: 'POST',
  headers: {
    'Authorization': `token ${env.GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'LittleBearApps-ErrorLogger/1.0'
  },
  body: JSON.stringify({
    title: payload.title,
    body: issueBody,
    labels: labels
  })
});
```

---

### Component 3: GitHub Actions Workflow

**File**: `.github/workflows/auto-triage.yml`

```yaml
name: Auto-Triage Error Issues

on:
  issues:
    types: [opened, labeled]

jobs:
  triage:
    runs-on: ubuntu-latest
    if: contains(github.event.issue.labels.*.name, 'auto-triage')

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Parse issue metadata
        id: parse
        run: |
          # Extract fingerprint from issue body
          FINGERPRINT=$(echo "${{ github.event.issue.body }}" | grep -oP 'fingerprint: \K[a-f0-9]{16}' || echo "")
          EXTENSION=$(echo "${{ github.event.issue.body }}" | grep -oP 'extension: \K\w+' || echo "")
          SURFACE=$(echo "${{ github.event.issue.body }}" | grep -oP 'surface: \K\w+' || echo "")

          echo "fingerprint=$FINGERPRINT" >> $GITHUB_OUTPUT
          echo "extension=$EXTENSION" >> $GITHUB_OUTPUT
          echo "surface=$SURFACE" >> $GITHUB_OUTPUT

      - name: Check if auto-fixable
        id: check
        run: |
          # Policy engine: determine if this error class is auto-fixable
          python3 scripts/auto-fix-policy.py \
            --fingerprint "${{ steps.parse.outputs.fingerprint }}" \
            --extension "${{ steps.parse.outputs.extension }}" \
            --surface "${{ steps.parse.outputs.surface }}" \
            --issue-body "${{ github.event.issue.body }}"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Route to AI agent
        if: steps.check.outputs.auto_fixable == 'true'
        run: |
          # Trigger AI agent based on change class
          CHANGE_CLASS="${{ steps.check.outputs.change_class }}"

          if [ "$CHANGE_CLASS" = "safe" ]; then
            # Use Codex Cloud for fast, safe fixes
            python3 scripts/invoke-codex-agent.py \
              --issue-number "${{ github.event.issue.number }}" \
              --fingerprint "${{ steps.parse.outputs.fingerprint }}"
          elif [ "$CHANGE_CLASS" = "needs-validation" ]; then
            # Use Claude API (Opus) for complex analysis
            python3 scripts/invoke-claude-agent.py \
              --issue-number "${{ github.event.issue.number }}" \
              --fingerprint "${{ steps.parse.outputs.fingerprint }}"
          fi
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Add human review label
        if: steps.check.outputs.auto_fixable == 'false'
        run: |
          gh issue edit "${{ github.event.issue.number }}" \
            --add-label "needs-human-review" \
            --add-label "change-class:${{ steps.check.outputs.change_class }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

### Component 4: Policy Engine (Auto-Fix Safety Gates)

**File**: `scripts/auto-fix-policy.py`

```python
#!/usr/bin/env python3
"""
Auto-fix policy engine: Determines if an error is safe to auto-fix.

Change Classes:
- safe: Documentation, comments, type annotations, logs
- needs-validation: Business logic, UI changes, API calls
- critical: Authentication, payments, data integrity
"""

import sys
import json
import re
from typing import Dict, List, Tuple

# Safe change patterns (auto-merge allowed)
SAFE_PATTERNS = [
    r'TypeError:.*undefined.*property',     # Common undefined access
    r'ReferenceError:.*is not defined',     # Missing variable declaration
    r'Uncaught.*in promise',                # Unhandled promise rejection
    r'JSDOC.*missing',                      # Documentation issues
    r'TypeScript.*type mismatch',           # Type annotation fixes
    r'console\.(log|warn|error)',           # Logging statement issues
]

# Needs validation patterns (human review after AI fix)
VALIDATION_PATTERNS = [
    r'fetch.*failed',                       # Network/API errors
    r'chrome\.storage',                     # Storage API issues
    r'chrome\.runtime',                     # Extension API issues
    r'UI.*rendering',                       # UI/UX issues
    r'onClick.*handler',                    # Event handler bugs
]

# Critical patterns (NEVER auto-fix, always human review)
CRITICAL_PATTERNS = [
    r'auth',                                # Authentication flows
    r'payment',                             # Payment processing
    r'stripe',                              # Billing integration
    r'user.*data.*corruption',              # Data integrity
    r'XSS|injection|CSRF',                  # Security vulnerabilities
]

# Surfaces that are safe for auto-fix
SAFE_SURFACES = ['popup', 'options']
CRITICAL_SURFACES = ['background', 'service-worker']


def classify_error(fingerprint: str, extension: str, surface: str, issue_body: str) -> Tuple[bool, str]:
    """
    Returns: (auto_fixable: bool, change_class: str)

    change_class: 'safe', 'needs-validation', 'critical'
    """

    # Check critical patterns first (highest priority)
    for pattern in CRITICAL_PATTERNS:
        if re.search(pattern, issue_body, re.IGNORECASE):
            return (False, 'critical')

    # Check surface criticality
    if surface in CRITICAL_SURFACES:
        # Service workers are critical - need validation even for "safe" changes
        for pattern in SAFE_PATTERNS:
            if re.search(pattern, issue_body, re.IGNORECASE):
                return (True, 'needs-validation')
        return (False, 'critical')

    # Check safe patterns (auto-merge allowed)
    for pattern in SAFE_PATTERNS:
        if re.search(pattern, issue_body, re.IGNORECASE):
            return (True, 'safe')

    # Check validation patterns (AI fix + human review)
    for pattern in VALIDATION_PATTERNS:
        if re.search(pattern, issue_body, re.IGNORECASE):
            return (True, 'needs-validation')

    # Default: needs human review
    return (False, 'unknown')


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--fingerprint', required=True)
    parser.add_argument('--extension', required=True)
    parser.add_argument('--surface', required=True)
    parser.add_argument('--issue-body', required=True)
    args = parser.parse_args()

    auto_fixable, change_class = classify_error(
        args.fingerprint,
        args.extension,
        args.surface,
        args.issue_body
    )

    # Output for GitHub Actions
    with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
        f.write(f'auto_fixable={str(auto_fixable).lower()}\n')
        f.write(f'change_class={change_class}\n')

    print(f'Auto-fixable: {auto_fixable}')
    print(f'Change class: {change_class}')
```

---

### Component 5: AI Agent Integration

#### Option A: Codex Cloud (Fast, Safe Fixes)

**File**: `scripts/invoke-codex-agent.py`

```python
#!/usr/bin/env python3
"""
Invoke Codex Cloud agent for safe, automated fixes.
Uses OpenAI API (GPT-5) via Codex Cloud interface.
"""

import os
import json
import requests
from typing import Dict

CODEX_CLOUD_API = "https://api.codex.dev/v1"  # Hypothetical endpoint


def invoke_codex_agent(issue_number: int, fingerprint: str) -> Dict:
    """
    Sends error context to Codex Cloud, receives fix proposal.
    """

    # Fetch issue details from GitHub
    gh_token = os.environ['GITHUB_TOKEN']
    issue_url = f"https://api.github.com/repos/littlebearapps/notebridge/issues/{issue_number}"

    response = requests.get(issue_url, headers={
        'Authorization': f'token {gh_token}',
        'Accept': 'application/vnd.github.v3+json'
    })
    issue_data = response.json()

    # Prepare Codex Cloud request
    codex_request = {
        'task': 'fix_error',
        'context': {
            'issue_title': issue_data['title'],
            'issue_body': issue_data['body'],
            'fingerprint': fingerprint,
            'repository': 'littlebearapps/notebridge',
            'branch': 'main'
        },
        'constraints': {
            'change_class': 'safe',
            'max_files_modified': 3,
            'require_tests': True,
            'preserve_behavior': True
        }
    }

    # Call Codex Cloud API
    codex_response = requests.post(
        f"{CODEX_CLOUD_API}/agents/fix",
        headers={
            'Authorization': f'Bearer {os.environ["OPENAI_API_KEY"]}',
            'Content-Type': 'application/json'
        },
        json=codex_request,
        timeout=300  # 5 min timeout
    )

    fix_proposal = codex_response.json()

    # Codex returns: { 'pr_url': '...', 'changes': [...], 'tests': [...] }
    return fix_proposal


def create_pr_from_proposal(proposal: Dict, issue_number: int):
    """
    Creates GitHub PR with Codex's proposed changes.
    """

    # Codex Cloud handles PR creation internally
    # Just link the PR back to the issue

    gh_token = os.environ['GITHUB_TOKEN']
    pr_url = proposal['pr_url']

    # Comment on issue with PR link
    comment_url = f"https://api.github.com/repos/littlebearapps/notebridge/issues/{issue_number}/comments"
    requests.post(comment_url, headers={
        'Authorization': f'token {gh_token}',
        'Accept': 'application/vnd.github.v3+json'
    }, json={
        'body': f'🤖 **Codex Cloud** has proposed a fix: {pr_url}\n\n'
                f'**Change Class**: `safe` (auto-merge enabled)\n'
                f'**Files Modified**: {len(proposal["changes"])}\n'
                f'**Tests Added**: {len(proposal["tests"])}\n\n'
                f'This PR will auto-merge if CI passes.'
    })

    print(f'Created PR: {pr_url}')


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--issue-number', type=int, required=True)
    parser.add_argument('--fingerprint', required=True)
    args = parser.parse_args()

    proposal = invoke_codex_agent(args.issue_number, args.fingerprint)
    create_pr_from_proposal(proposal, args.issue_number)
```

#### Option B: Claude API (Complex Analysis)

**File**: `scripts/invoke-claude-agent.py`

```python
#!/usr/bin/env python3
"""
Invoke Claude API (Opus) for complex error analysis.
Used for 'needs-validation' change class.
"""

import os
import json
import requests
import anthropic
from typing import Dict


def invoke_claude_agent(issue_number: int, fingerprint: str) -> Dict:
    """
    Uses Claude API to analyze error and propose fix.
    Requires human review before merge.
    """

    # Fetch issue details
    gh_token = os.environ['GITHUB_TOKEN']
    issue_url = f"https://api.github.com/repos/littlebearapps/notebridge/issues/{issue_number}"

    response = requests.get(issue_url, headers={
        'Authorization': f'token {gh_token}',
        'Accept': 'application/vnd.github.v3+json'
    })
    issue_data = response.json()

    # Initialize Claude client
    client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

    # Prepare prompt for Claude
    prompt = f"""
You are debugging a production error in the NoteBridge Chrome extension.

**Error Report**:
{issue_data['body']}

**Task**:
1. Analyze the root cause of this error
2. Propose a fix with code changes
3. Write comprehensive tests to prevent regression
4. Explain potential side effects

**Constraints**:
- Preserve existing behavior (no breaking changes)
- Follow existing code style and patterns
- Add defensive programming (null checks, validation)
- Update JSDoc comments if applicable

**Output Format**:
Provide your analysis as JSON:
{{
  "root_cause": "...",
  "proposed_fix": {{
    "files": [
      {{"path": "...", "changes": "..."}},
      ...
    ],
    "tests": [
      {{"path": "...", "test_code": "..."}},
      ...
    ]
  }},
  "side_effects": ["...", "..."],
  "confidence": "high|medium|low"
}}
"""

    # Call Claude API
    message = client.messages.create(
        model="claude-opus-4-20250514",
        max_tokens=8000,
        temperature=0.2,  # Low temperature for code generation
        messages=[{
            "role": "user",
            "content": prompt
        }]
    )

    # Parse Claude's response
    analysis = json.loads(message.content[0].text)

    return analysis


def create_pr_from_claude_analysis(analysis: Dict, issue_number: int):
    """
    Creates GitHub PR from Claude's analysis.
    Requires human review (no auto-merge).
    """

    # Create branch
    branch_name = f"auto-fix/issue-{issue_number}"

    # Apply changes (pseudo-code - would use GitHub API or git commands)
    for file_change in analysis['proposed_fix']['files']:
        # apply_file_change(file_change['path'], file_change['changes'])
        pass

    # Create PR
    gh_token = os.environ['GITHUB_TOKEN']
    pr_url = f"https://api.github.com/repos/littlebearapps/notebridge/pulls"

    pr_body = f"""
## 🤖 AI-Proposed Fix for #{issue_number}

**Root Cause**:
{analysis['root_cause']}

**Proposed Changes**:
{len(analysis['proposed_fix']['files'])} files modified
{len(analysis['proposed_fix']['tests'])} tests added

**Potential Side Effects**:
{''.join(f'- {effect}\n' for effect in analysis['side_effects'])}

**AI Confidence**: {analysis['confidence'].upper()}

---

⚠️ **HUMAN REVIEW REQUIRED** - Do not auto-merge
"""

    pr_response = requests.post(pr_url, headers={
        'Authorization': f'token {gh_token}',
        'Accept': 'application/vnd.github.v3+json'
    }, json={
        'title': f'[AI Fix] Issue #{issue_number}',
        'head': branch_name,
        'base': 'main',
        'body': pr_body
    })

    pr_data = pr_response.json()

    # Add labels
    requests.post(f"{pr_data['issue_url']}/labels", headers={
        'Authorization': f'token {gh_token}',
        'Accept': 'application/vnd.github.v3+json'
    }, json={
        'labels': ['ai-proposed', 'needs-human-review', 'change-class:needs-validation']
    })

    print(f'Created PR: {pr_data["html_url"]}')


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--issue-number', type=int, required=True)
    parser.add_argument('--fingerprint', required=True)
    args = parser.parse_args()

    analysis = invoke_claude_agent(args.issue_number, args.fingerprint)
    create_pr_from_claude_analysis(analysis, args.issue_number)
```

---

### Component 6: Auto-Merge with Safety Checks

**File**: `.github/workflows/auto-merge.yml`

```yaml
name: Auto-Merge Safe Changes

on:
  pull_request:
    types: [opened, synchronize, labeled]
  check_suite:
    types: [completed]

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: |
      contains(github.event.pull_request.labels.*.name, 'ai-proposed') &&
      contains(github.event.pull_request.labels.*.name, 'change-class:safe')

    steps:
      - name: Wait for CI checks
        uses: fountainhead/action-wait-for-check@v1.2.0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          checkName: 'build'
          ref: ${{ github.event.pull_request.head.sha }}

      - name: Verify all checks passed
        run: |
          # Check if ALL required checks passed
          gh pr checks "${{ github.event.pull_request.number }}" --json name,status,conclusion \
            | jq -e 'all(.[] | .status == "COMPLETED" and .conclusion == "SUCCESS")'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Verify PR requirements
        run: |
          # Additional safety checks
          PR_NUMBER="${{ github.event.pull_request.number }}"

          # 1. Check file count (max 3 files for auto-merge)
          FILES_CHANGED=$(gh pr view $PR_NUMBER --json files --jq '.files | length')
          if [ "$FILES_CHANGED" -gt 3 ]; then
            echo "Too many files changed ($FILES_CHANGED > 3). Requires human review."
            gh pr edit $PR_NUMBER --add-label "needs-human-review"
            exit 1
          fi

          # 2. Check if tests were added
          HAS_TESTS=$(gh pr view $PR_NUMBER --json files --jq '.files[].path' | grep -c 'test' || echo 0)
          if [ "$HAS_TESTS" -eq 0 ]; then
            echo "No tests added. Requires human review."
            gh pr edit $PR_NUMBER --add-label "needs-human-review"
            exit 1
          fi

          # 3. Check bundle size impact (max +5KB)
          # (Would integrate with bundle size CI check)

          echo "All safety checks passed. Proceeding with auto-merge."
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge PR
        run: |
          gh pr merge "${{ github.event.pull_request.number }}" \
            --squash \
            --delete-branch \
            --auto \
            --subject "🤖 Auto-fix: ${{ github.event.pull_request.title }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Close linked issue
        run: |
          # Extract issue number from PR body
          ISSUE_NUMBER=$(echo "${{ github.event.pull_request.body }}" | grep -oP 'Issue #\K\d+' || echo "")

          if [ -n "$ISSUE_NUMBER" ]; then
            gh issue close "$ISSUE_NUMBER" --comment "✅ Fixed by PR #${{ github.event.pull_request.number }}"
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Notify Slack
        uses: slackapi/slack-github-action@v1.26.0
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "🤖 Auto-merged PR #${{ github.event.pull_request.number }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Auto-Fix Deployed* ✅\n\n*PR*: <${{ github.event.pull_request.html_url }}|#${{ github.event.pull_request.number }}>\n*Change Class*: `safe`\n*Files Changed*: ${{ github.event.pull_request.changed_files }}"
                  }
                }
              ]
            }
```

---

### Component 7: Canary Deployment System

**File**: `.github/workflows/canary-deploy.yml`

```yaml
name: Canary Deployment

on:
  push:
    branches:
      - main

jobs:
  deploy-canary:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Build extension
        run: |
          npm ci
          npm run build

      - name: Upload to Chrome Web Store (5% rollout)
        run: |
          # Use Chrome Web Store API to deploy canary
          python3 scripts/chrome-store-deploy.py \
            --rollout-percentage 5 \
            --monitor-duration 3600  # 1 hour monitoring
        env:
          CHROME_STORE_CLIENT_ID: ${{ secrets.CHROME_STORE_CLIENT_ID }}
          CHROME_STORE_CLIENT_SECRET: ${{ secrets.CHROME_STORE_CLIENT_SECRET }}
          CHROME_STORE_REFRESH_TOKEN: ${{ secrets.CHROME_STORE_REFRESH_TOKEN }}

      - name: Monitor canary errors
        run: |
          # Poll error logger for 1 hour, check error rate
          python3 scripts/monitor-canary.py \
            --duration 3600 \
            --error-threshold 0.05  # 5% error rate max
        env:
          CLOUDFLARE_WORKER_URL: https://logger-worker-prod.nathan-55a.workers.dev

      - name: Rollback if errors detected
        if: failure()
        run: |
          # Rollback to previous version
          python3 scripts/chrome-store-deploy.py --rollback
        env:
          CHROME_STORE_CLIENT_ID: ${{ secrets.CHROME_STORE_CLIENT_ID }}
          CHROME_STORE_CLIENT_SECRET: ${{ secrets.CHROME_STORE_CLIENT_SECRET }}
          CHROME_STORE_REFRESH_TOKEN: ${{ secrets.CHROME_STORE_REFRESH_TOKEN }}

      - name: Promote to 100% if successful
        if: success()
        run: |
          python3 scripts/chrome-store-deploy.py --rollout-percentage 100
        env:
          CHROME_STORE_CLIENT_ID: ${{ secrets.CHROME_STORE_CLIENT_ID }}
          CHROME_STORE_CLIENT_SECRET: ${{ secrets.CHROME_STORE_CLIENT_SECRET }}
          CHROME_STORE_REFRESH_TOKEN: ${{ secrets.CHROME_STORE_REFRESH_TOKEN }}
```

**File**: `scripts/monitor-canary.py`

```python
#!/usr/bin/env python3
"""
Monitors canary deployment for error spikes.
Polls Cloudflare Worker analytics for error rate.
"""

import os
import time
import requests
from datetime import datetime, timedelta


def get_error_rate(worker_url: str, start_time: datetime) -> float:
    """
    Fetches error rate from Cloudflare Worker analytics.
    Returns: error_rate (0.0 to 1.0)
    """

    # Cloudflare Workers analytics API
    # (Pseudo-code - actual implementation would use Cloudflare API)

    analytics_url = f"{worker_url}/analytics"
    response = requests.get(analytics_url, params={
        'start': start_time.isoformat(),
        'end': datetime.utcnow().isoformat()
    })

    data = response.json()

    total_requests = data.get('total_requests', 0)
    error_requests = data.get('error_requests', 0)

    if total_requests == 0:
        return 0.0

    return error_requests / total_requests


def monitor_canary(duration_seconds: int, error_threshold: float):
    """
    Monitors error rate for specified duration.
    Exits with code 1 if error rate exceeds threshold.
    """

    worker_url = os.environ['CLOUDFLARE_WORKER_URL']
    start_time = datetime.utcnow()
    end_time = start_time + timedelta(seconds=duration_seconds)

    print(f'Monitoring canary deployment for {duration_seconds}s...')
    print(f'Error threshold: {error_threshold * 100}%')

    while datetime.utcnow() < end_time:
        error_rate = get_error_rate(worker_url, start_time)

        print(f'[{datetime.utcnow().isoformat()}] Error rate: {error_rate * 100:.2f}%')

        if error_rate > error_threshold:
            print(f'❌ Error rate {error_rate * 100:.2f}% exceeds threshold {error_threshold * 100}%')
            print('Triggering rollback...')
            exit(1)

        time.sleep(60)  # Check every minute

    print(f'✅ Canary deployment successful. Error rate: {error_rate * 100:.2f}%')
    exit(0)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--duration', type=int, required=True, help='Monitoring duration in seconds')
    parser.add_argument('--error-threshold', type=float, required=True, help='Max error rate (0.0-1.0)')
    args = parser.parse_args()

    monitor_canary(args.duration, args.error_threshold)
```

---

## 📋 Implementation Phases

### Phase 0: Infrastructure Setup (2-3 hours)

**Deliverables**:
- [ ] GitHub Actions workflows created (`.github/workflows/`)
- [ ] Python scripts scaffolded (`scripts/`)
- [ ] Policy engine implemented (`auto-fix-policy.py`)
- [ ] Test GitHub issue creation from logger (manual trigger)

**Tasks**:
1. Create `.github/workflows/auto-triage.yml`
2. Create `.github/workflows/auto-merge.yml`
3. Create `.github/workflows/canary-deploy.yml`
4. Implement `scripts/auto-fix-policy.py`
5. Add GitHub secrets (ANTHROPIC_API_KEY, OPENAI_API_KEY, CHROME_STORE_*)
6. Test end-to-end with dummy issue

**Success Criteria**:
- Dummy issue triggers GitHub Actions workflow
- Policy engine correctly classifies safe vs critical errors
- All secrets configured and accessible

---

### Phase 1: Error Fingerprinting (3-4 hours)

**Deliverables**:
- [ ] SHA-256 fingerprinting in `shared/error-logger.js`
- [ ] Fingerprint deduplication (7-day window)
- [ ] Fingerprint storage cleanup (Chrome Alarms)
- [ ] Worker enhancement to accept fingerprint
- [ ] GitHub issue labeling with fingerprint

**Tasks**:
1. Add `generateFingerprint()` function to `error-logger.js`
2. Implement Web Crypto API SHA-256 hashing
3. Add fingerprint check before `reportToGitHub()`
4. Store fingerprints in `chrome.storage.local`
5. Add Chrome Alarm for 30-day cleanup
6. Update Worker to include fingerprint in issue labels
7. Test with duplicate errors (should block second report)

**Success Criteria**:
- Same error reported twice = second attempt blocked
- GitHub issues have `fingerprint:XXXXXXXX` label
- Fingerprint storage cleaned up after 30 days

---

### Phase 2: AI Agent Integration (5-7 hours)

**Deliverables**:
- [ ] Codex Cloud agent integration (`invoke-codex-agent.py`)
- [ ] Claude API agent integration (`invoke-claude-agent.py`)
- [ ] Auto-triage workflow triggers agents based on change class
- [ ] PR creation from agent proposals
- [ ] Test with real error (safe change class)

**Tasks**:
1. Implement `invoke-codex-agent.py` with OpenAI API
2. Implement `invoke-claude-agent.py` with Anthropic API
3. Update `auto-triage.yml` to route to agents
4. Test Codex Cloud agent with TypeError (safe)
5. Test Claude API agent with network error (needs-validation)
6. Verify PR creation and linking to original issue

**Success Criteria**:
- Safe errors trigger Codex Cloud agent → PR created
- Complex errors trigger Claude API agent → PR created (needs review)
- PRs include proposed changes + tests
- Original issue commented with PR link

---

### Phase 3: Auto-Merge Safety (4-5 hours)

**Deliverables**:
- [ ] Auto-merge workflow (`auto-merge.yml`)
- [ ] Safety checks (file count, tests required, bundle size)
- [ ] Slack notifications on auto-merge
- [ ] Issue auto-close on PR merge
- [ ] Test with safe change class

**Tasks**:
1. Implement `auto-merge.yml` workflow
2. Add safety checks (max 3 files, tests required)
3. Integrate Slack webhook for notifications
4. Add issue auto-close logic
5. Test auto-merge with AI-proposed PR (safe change class)
6. Verify human review label for needs-validation class

**Success Criteria**:
- Safe PRs auto-merge after CI passes
- Needs-validation PRs require human approval
- Slack notified on auto-merge
- Original issue auto-closed with PR reference

---

### Phase 4: Canary Deployment (4-6 hours)

**Deliverables**:
- [ ] Chrome Web Store API integration
- [ ] Canary deployment workflow (5% rollout)
- [ ] Error monitoring script (`monitor-canary.py`)
- [ ] Auto-rollback on error spike
- [ ] Test with production deployment

**Tasks**:
1. Set up Chrome Web Store API credentials
2. Implement `scripts/chrome-store-deploy.py`
3. Implement `scripts/monitor-canary.py`
4. Add Cloudflare Worker analytics endpoint
5. Create `canary-deploy.yml` workflow
6. Test canary deployment (5% rollout)
7. Simulate error spike and verify rollback

**Success Criteria**:
- Canary deploys to 5% of users
- Error monitoring polls Worker analytics
- Auto-rollback triggers if error rate > 5%
- Successful canary promotes to 100%

---

### Phase 5: End-to-End Testing (2-3 hours)

**Deliverables**:
- [ ] E2E test: Error → Issue → AI Fix → Auto-Merge → Deploy
- [ ] E2E test: Critical error → Human review required
- [ ] E2E test: Canary rollback on error spike
- [ ] Documentation (`README.md` update)

**Tasks**:
1. Trigger production error in NoteBridge
2. Verify issue creation with fingerprint
3. Verify AI agent proposes fix
4. Verify auto-merge (safe) or human review (critical)
5. Verify canary deployment
6. Document full workflow in README

**Success Criteria**:
- Safe error fixed end-to-end in < 1 hour
- Critical error flagged for human review
- Canary rollback works correctly
- All edge cases handled gracefully

---

## 🧪 Testing Strategy

### Unit Tests

**`tests/fingerprinting.test.js`**:
- SHA-256 hash generation
- Fingerprint normalization (line numbers, UUIDs, timestamps)
- Duplicate detection (7-day window)
- Storage cleanup logic

**`tests/policy-engine.test.py`**:
- Safe pattern classification
- Critical pattern detection
- Surface-based rules (background vs popup)
- Edge cases (unknown error types)

### Integration Tests

**`tests/integration/github-workflow.test.js`**:
- Issue creation → GitHub Actions trigger
- Metadata parsing from issue body
- Agent routing based on change class
- PR creation and labeling

**`tests/integration/ai-agents.test.py`**:
- Codex Cloud API integration (mocked)
- Claude API integration (mocked)
- PR creation from agent proposals
- Error handling (API failures, timeouts)

### E2E Tests

**`tests/e2e/auto-fix-safe.spec.ts`**:
1. Trigger TypeError in NoteBridge popup
2. Logger captures & fingerprints error
3. User reports to GitHub
4. GitHub Actions triggers Codex Cloud agent
5. Agent proposes fix → PR created
6. CI passes → Auto-merge
7. Canary deploys → Monitors → Promotes to 100%
8. Original issue closed

**`tests/e2e/auto-fix-critical.spec.ts`**:
1. Trigger authentication error in NoteBridge background
2. Logger captures error
3. User reports to GitHub
4. Policy engine classifies as critical
5. Issue labeled "needs-human-review"
6. No AI agent triggered (manual fix required)

**`tests/e2e/canary-rollback.spec.ts`**:
1. Deploy canary with intentional bug
2. Error rate spikes above threshold
3. Monitor script detects spike
4. Auto-rollback triggered
5. Previous version restored
6. Slack notification sent

---

## 📊 Monitoring & Observability

### Metrics to Track

**Error Logger Metrics**:
- Errors captured per extension (daily)
- Errors reported to GitHub (daily)
- Fingerprint deduplication rate (% duplicates blocked)
- Storage quota usage (chrome.storage.local)

**Auto-Fix Metrics**:
- Issues triaged automatically (daily)
- Safe fixes auto-merged (daily)
- Critical issues flagged for human review (daily)
- Average time-to-fix (error → merged PR)
- AI agent success rate (% fixes accepted)

**Deployment Metrics**:
- Canary deployments triggered (daily)
- Canary rollbacks triggered (daily)
- Error rate during canary (5% cohort)
- Time to 100% rollout (average)

### Dashboards

**Plausible Analytics** (keep existing):
- Error trends by extension
- Error trends by surface (popup, options, background)
- Error trends by version

**Cloudflare Workers Analytics**:
- GitHub issue creation rate
- Worker error rate (4xx, 5xx)
- Quota enforcement (429 responses)
- Average response time

**GitHub Insights**:
- AI-proposed PRs (opened, merged, rejected)
- Change class distribution (safe, needs-validation, critical)
- Average PR review time (human reviews)

### Alerts

**Slack Notifications**:
- 🤖 Auto-merge successful (safe fixes)
- ⚠️ Auto-fix failed (AI agent error)
- 🚨 Canary rollback triggered
- ⏸️ Human review required (critical issues)
- 📊 Weekly summary (metrics)

**Email Alerts** (GitHub):
- CI failure on auto-merge PR
- Canary deployment failed
- Error rate spike (> 5% in any extension)

---

## 💰 Cost Analysis & ROI

### One-Time Setup Costs

| Phase | Hours | Cost @ $100/hr |
|-------|-------|----------------|
| Phase 0: Infrastructure | 3 | $300 |
| Phase 1: Fingerprinting | 4 | $400 |
| Phase 2: AI Agents | 6 | $600 |
| Phase 3: Auto-Merge | 5 | $500 |
| Phase 4: Canary Deploy | 5 | $500 |
| Phase 5: E2E Testing | 3 | $300 |
| **Total** | **26** | **$2,600** |

### Ongoing Costs

**AI API Costs** (monthly estimate):
- **Codex Cloud (OpenAI GPT-5)**: $0.15/1M input tokens, $0.60/1M output tokens
  - Assume 10 safe fixes/month × 10k tokens avg = $0.75/month
- **Claude API (Opus)**: $15/1M input tokens, $75/1M output tokens
  - Assume 5 complex fixes/month × 20k tokens avg = $6.00/month
- **Total AI costs**: ~$7-10/month

**Infrastructure Costs**:
- Cloudflare Workers: Free tier (100k req/day) ✅
- GitHub Actions: Free tier (2,000 min/month) ✅
- Chrome Web Store API: Free ✅

**Total Ongoing**: ~$10/month

### ROI Calculation

**Time Savings**:
- Manual bug fix: 2-4 hours (investigation + fix + testing + deployment)
- Auto-fix: < 1 hour (error → merged PR)
- **Time saved per fix**: 1-3 hours

**Monthly Impact** (conservative estimate):
- 5 safe fixes auto-merged: 5-15 hours saved
- 3 complex fixes accelerated: 3-9 hours saved
- **Total time saved**: 8-24 hours/month

**Financial Impact**:
- Time saved @ $100/hr: $800-2,400/month
- AI costs: -$10/month
- **Net monthly savings**: $790-2,390/month

**Break-Even**:
- Setup cost: $2,600
- Monthly savings: $790-2,390
- **Break-even**: 1-3 months ✅

**3-Year ROI**:
- Total savings: $28,440-85,920
- Setup cost: -$2,600
- AI costs: -$360
- **Net 3-year ROI**: $25,480-82,960 🚀

### Comparison to Custom Analytics

| Metric | Homeostat | Custom Analytics |
|--------|-----------|------------------|
| Year 1 cost | $2,600 setup + $120 AI | $20,000-30,000 |
| Ongoing/year | $120 AI | $9,600-14,400 |
| 3-year cost | $2,960 | $39,200-58,800 |
| 3-year ROI | +$25,480-82,960 | -$39,200-58,800 |
| **Winner** | ✅ **Homeostat** | ❌ Custom Analytics |

---

## ⚠️ Risk Mitigation

### Risk 1: AI Proposes Incorrect Fix

**Mitigation**:
- ✅ Policy engine classifies change classes (safe vs critical)
- ✅ Comprehensive CI checks (tests, types, lint, bundle size)
- ✅ Canary deployment (5% rollout first)
- ✅ Error monitoring with auto-rollback
- ✅ Human review required for critical changes

**Residual Risk**: LOW (multiple safety gates)

### Risk 2: Auto-Merge Breaks Production

**Mitigation**:
- ✅ Only safe change classes auto-merge (docs, comments, types, logs)
- ✅ Requires tests + CI passing
- ✅ Max 3 files modified for auto-merge
- ✅ Canary deployment catches issues before 100% rollout
- ✅ Auto-rollback within 1 hour if error spike

**Residual Risk**: LOW (canary deployment is safety net)

### Risk 3: GitHub Actions Costs Exceed Free Tier

**Mitigation**:
- ✅ Free tier: 2,000 minutes/month
- ✅ Estimate: 15 fixes/month × 10 min = 150 min/month (7.5% of quota)
- ✅ Monitor usage via GitHub billing dashboard
- ✅ Add budget alerts at 80% usage

**Residual Risk**: VERY LOW (13x headroom)

### Risk 4: AI API Costs Spike

**Mitigation**:
- ✅ Rate limiting in policy engine (max 20 AI calls/day)
- ✅ Token limits on prompts (8k tokens max)
- ✅ Monitor API costs via OpenAI/Anthropic dashboards
- ✅ Budget alerts at $50/month

**Residual Risk**: LOW (fixed token limits)

### Risk 5: False Positives (Auto-Fix Safe Errors That Aren't)

**Mitigation**:
- ✅ Conservative policy engine (bias toward human review)
- ✅ Iterative refinement of safe patterns (learn from failures)
- ✅ Escape hatch: Add `no-auto-fix` label to issue
- ✅ Weekly review of auto-merged PRs (audit trail)

**Residual Risk**: MEDIUM (improve patterns over time)

### Risk 6: Fingerprint Collisions (Different Errors Same Hash)

**Mitigation**:
- ✅ SHA-256 provides 2^128 collision resistance
- ✅ Fingerprint includes: error type + normalized stack + surface
- ✅ Manual override: "Force report" option in UI
- ✅ Monitor fingerprint uniqueness (metrics dashboard)

**Residual Risk**: VERY LOW (SHA-256 collision probability negligible)

---

## 📈 Success Metrics

### Phase 0-2: Foundation (Weeks 1-2)

**Goals**:
- ✅ Infrastructure deployed
- ✅ First AI-proposed PR created
- ✅ Fingerprinting working (0 duplicate reports)

**KPIs**:
- 100% of errors fingerprinted correctly
- 0 duplicate GitHub issues created
- 1+ AI-proposed PR created

### Phase 3-4: Automation (Weeks 3-4)

**Goals**:
- ✅ First auto-merge successful
- ✅ Canary deployment working
- ✅ Zero production incidents

**KPIs**:
- 1+ safe fix auto-merged
- 1+ canary deployment (5% → 100%)
- 0 rollbacks triggered (but tested)

### Month 1: Validation

**Goals**:
- ✅ 5+ auto-fixes deployed
- ✅ Time-to-fix < 1 hour (avg)
- ✅ AI success rate > 70%

**KPIs**:
- 5+ issues auto-triaged
- 3+ safe fixes auto-merged
- Average time-to-fix < 60 min
- AI proposal acceptance rate > 70%

### Month 3: Optimization

**Goals**:
- ✅ 15+ auto-fixes deployed
- ✅ Time-to-fix < 30 min (avg)
- ✅ AI success rate > 85%

**KPIs**:
- 15+ issues auto-triaged
- 10+ safe fixes auto-merged
- Average time-to-fix < 30 min
- AI proposal acceptance rate > 85%

### Month 6: Scaling

**Goals**:
- ✅ Expand to all 3 extensions (NoteBridge, ConvertMyFile, PaletteKit)
- ✅ 50+ auto-fixes deployed
- ✅ Time-to-fix < 15 min (avg)

**KPIs**:
- 50+ issues auto-triaged across 3 extensions
- 30+ safe fixes auto-merged
- Average time-to-fix < 15 min
- Zero production incidents from auto-fixes

---

## 🚀 Deployment Plan

### Week 1-2: Phase 0-1 (Infrastructure + Fingerprinting)

**Monday-Wednesday**:
- Set up GitHub Actions workflows
- Implement policy engine
- Test with dummy issues

**Thursday-Friday**:
- Implement error fingerprinting
- Update Worker to accept fingerprints
- Test deduplication (trigger same error twice)

**Weekend**:
- Buffer for testing & bug fixes

### Week 3-4: Phase 2-3 (AI Agents + Auto-Merge)

**Monday-Wednesday**:
- Integrate Codex Cloud agent
- Integrate Claude API agent
- Test AI-proposed PRs

**Thursday-Friday**:
- Implement auto-merge workflow
- Add safety checks
- Test safe change auto-merge

**Weekend**:
- Buffer for testing & bug fixes

### Week 5: Phase 4 (Canary Deployment)

**Monday-Wednesday**:
- Chrome Web Store API setup
- Implement canary deployment workflow
- Test 5% rollout

**Thursday-Friday**:
- Implement error monitoring
- Test auto-rollback
- End-to-end smoke test

**Weekend**:
- Final testing & documentation

### Week 6: Production Launch

**Monday**:
- Deploy to NoteBridge (first extension)
- Monitor for 24 hours

**Tuesday-Friday**:
- Fix any issues
- Expand to ConvertMyFile (if NoteBridge successful)
- Week 1 monitoring (daily checks)

---

## 📚 Documentation Requirements

### User-Facing Docs

**`README.md` update**:
- Add "Self-Healing System" section
- Explain how errors are auto-fixed
- Link to GitHub Issues for transparency

**`docs/SELF-HEALING-SYSTEM.md`** (NEW):
- How it works (user perspective)
- What errors are auto-fixed
- How to report errors that need human review
- Privacy guarantees (no auto-fixes touch user data)

### Developer Docs

**`docs/DEVELOPMENT.md` update**:
- How to test auto-fix locally
- How to add new safe patterns
- How to debug GitHub Actions workflows

**`docs/AI-AGENTS.md`** (NEW):
- Codex Cloud integration guide
- Claude API integration guide
- How to add new AI providers
- Cost management & monitoring

### Operations Docs

**`docs/OPERATIONS.md`** (NEW):
- How to monitor auto-fix system
- How to manually trigger auto-fix
- How to rollback canary deployment
- Incident response (auto-fix breaks production)

---

## 🎯 Next Steps

1. **Review this plan** with Nathan
2. **Decide on priority**: Start Phase 0 now OR wait until PR#6 merged
3. **Allocate time**: 26 hours over 5-6 weeks
4. **Get API keys**: OpenAI (Codex Cloud), Anthropic (Claude API), Chrome Web Store
5. **Start Phase 0**: Infrastructure setup (2-3 hours)

---

## ✅ Conclusion

**Bottom Line**: Build the self-healing loop, NOT custom analytics.

**Why**:
- ✅ **28x cheaper** than custom analytics ($2,960 vs $39,200-58,800 over 3 years)
- ✅ **Compounding value** (AI improves over time)
- ✅ **Competitive differentiation** (competitors don't have this)
- ✅ **Scalability** (works for 3 extensions now, 30+ later)
- ✅ **Innovation** (time-to-fix: days → hours → minutes)

**Keep Plausible** for analytics ($720/year) and invest saved time (70-105 hours) in product features.

**Timeline**: 5-6 weeks (26 hours total)
**ROI**: Break-even in 1-3 months, $25k-83k net savings over 3 years

---

**🤖 Ready to start when you are!**
