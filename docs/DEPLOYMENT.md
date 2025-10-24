# Homeostat Deployment Guide

## Prerequisites

- GitHub repository for Chrome extension (e.g., `littlebearapps/notebridge`)
- GitHub Actions enabled
- Node.js 20+ (for local testing)

---

## Secrets Configuration

### Required Secrets (GitHub Repository Settings)

Navigate to: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Description | How to Obtain |
|--------|-------------|---------------|
| `DEEPSEEK_API_KEY` | DeepSeek V3.2-Exp API key | [DeepSeek Platform](https://platform.deepseek.com) |
| `OPENAI_API_KEY` | GPT-5 API key | [OpenAI Platform](https://platform.openai.com) |
| `GITHUB_TOKEN` | Auto-generated (no action needed) | GitHub provides automatically |

### Optional Secrets

| Secret | Description | When Needed |
|--------|-------------|-------------|
| `SLACK_WEBHOOK_URL` | Slack notifications | If using Slack alerts |

---

## Installation

### Step 1: Add Workflow File

Create `.github/workflows/homeostat.yml` in your extension repository:

```yaml
name: Homeostat

on:
  issues:
    types: [labeled]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  auto-fix:
    if: contains(github.event.issue.labels.*.name, 'robot')
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Homeostat
        run: |
          git clone https://github.com/littlebearapps/homeostat.git
          cd homeostat
          npm ci

      - name: Process Issue
        run: |
          cd homeostat
          node homeostat/orchestrator.js \
            --issue-number ${{ github.event.issue.number }}
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Step 2: Configure Branch Protection

Enable branch protection on `main`:
1. Navigate to **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Enable: "Require pull request before merging"
4. Enable: "Require status checks to pass"
5. Save

### Step 3: Test Installation

Create a test issue with `robot` label:

```markdown
Title: [NoteBridge] Test Error

Body:
## Error Details
- Extension: NoteBridge v1.0.0
- Error Type: TestError
- Message: Test message
- Timestamp: 2025-10-24T10:00:00Z
- Fingerprint: test123

## Stack Trace
```
Error: Test
  at test.js:1:1
```

## Breadcrumbs
1. Test action
```

Add label: `robot`

Expected: GitHub Actions runs, PR created within 5 minutes.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOMEOSTAT_DEBUG` | `false` | Enable debug logging |
| `HOMEOSTAT_DRY_RUN` | `false` | Simulate fixes without creating PRs |
| `MAX_COST_PER_FIX` | `0.01` | Budget limit per fix ($) |

### Tier Overrides (Advanced)

Force specific tier for testing:

```yaml
- name: Process Issue
  run: node homeostat/orchestrator.js --force-tier 3
  env:
    FORCE_TIER: 3  # Force GPT-5 for all issues
```

---

## Monitoring

### View Logs

GitHub Actions → Select workflow run → Expand job

Look for structured JSON logs:
```json
{
  "timestamp": "2025-10-24T10:30:45.123Z",
  "level": "info",
  "message": "Fix completed",
  "runId": "a1b2c3d4...",
  "issueNumber": 123,
  "tier": 1,
  "success": true
}
```

### Check SLOs

Run locally:
```bash
npm run bench
npm run slo:check
```

Expected output:
```
✅ Cost: $9.15/year (target: $9.28)
✅ Success Rate: 75% (target: 70%)
```

---

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.

---

## Rollback

If Homeostat malfunctions:

### Option 1: Disable Workflow
1. Edit `.github/workflows/homeostat.yml`
2. Comment out entire file or change trigger to `workflow_dispatch`
3. Commit and push

### Option 2: Remove `robot` Label
- Homeostat only processes issues with `robot` label
- Logger can be configured to stop adding this label

---

## Upgrading Homeostat

```bash
cd homeostat
git pull origin main
npm ci
npm test
```

Then redeploy workflow file if changed.

---

## Cost Management

### Monitoring Costs

Check projected costs:
```bash
npm run cost:check
```

### Reducing Costs

If costs exceed budget:
1. **Reduce Tier 2/3 usage**: Adjust tier thresholds in `model-selector.js`
2. **Limit fixes per day**: Add rate limiting in workflow
3. **Disable for low-priority extensions**: Remove `robot` label trigger

---

## Security Considerations

- API keys never logged (sanitized)
- PII removed before AI calls
- Malicious patches blocked
- Sensitive files routed to GPT-5 only

See [SECURITY.md](../SECURITY.md) for full security posture.
