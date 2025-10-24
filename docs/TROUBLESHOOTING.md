# Homeostat Troubleshooting Guide

## Quick Diagnostics

### Issue Not Processing

**Check**:
1. Does issue have `robot` label? → If not, add it
2. Is GitHub Actions workflow enabled? → Check `.github/workflows/homeostat.yml`
3. Are secrets configured? → Settings → Secrets → Actions

**Test**:
```bash
# Locally simulate processing
node homeostat/orchestrator.js --issue-number 123
```

---

### Workflow Fails Immediately

**Error**: "Missing required secret: DEEPSEEK_API_KEY"

**Fix**:
1. Go to Settings → Secrets and variables → Actions
2. Add `DEEPSEEK_API_KEY` and `OPENAI_API_KEY`
3. Re-run workflow

---

### Tests Always Failing

**Symptom**: Every fix shows "Tests failed"

**Check**:
1. Run tests locally: `npm test`
2. If failing locally → Fix test suite first
3. If passing locally → Check CI environment differences

**Common Causes**:
- Missing environment variables
- Test fixtures outdated
- Extension code changed significantly

---

### High Costs

**Symptom**: Projected cost >$15/year

**Diagnosis**:
```bash
npm run cost:check
```

**Common Causes**:
- Too many Tier 3 fixes (expensive)
- Retry logic excessive
- High fix volume (>1,500/year)

**Fixes**:
- Adjust tier thresholds to favor Tier 1
- Reduce retry attempts from 2 to 1
- Limit fixes per day in workflow

---

### Low Success Rate

**Symptom**: <60% overall success rate

**Diagnosis**:
```bash
npm run metrics:export | jq '.successRate'
```

**By Tier**:
- Tier 1 <60%: Increase complexity threshold
- Tier 2 <80%: Review GPT-5 review prompts
- Tier 3 <90%: Investigate test suite or extension changes

---

## Error Messages

### "Missing required field: stackTrace"

**Cause**: Logger issue format invalid

**Fix**: Verify Logger is creating issues correctly

### "payload size exceeds limit"

**Cause**: Issue body >100KB

**Fix**: Configure Logger to truncate large stack traces

### "Fix exceeded budget: $0.015 > $0.01"

**Cause**: Single fix costs more than per-fix budget

**Fix**: Investigate why (likely Tier 3 with large context)

---

## Logs Analysis

### Find Specific Run

```bash
# GitHub Actions → Workflow runs → Search by issue number
# Or check structured logs:
cat logs/homeostat.log | jq 'select(.issueNumber == 123)'
```

### Extract Cost Data

```bash
cat logs/homeostat.log | jq 'select(.cost) | .cost' | jq -s 'add'
```

---

## Performance Issues

### Workflow Takes >15 Minutes

**Check**:
- Tier 3 fixes can take 5-10 minutes (normal)
- GitHub API rate limits may add delays

**Optimize**:
- Reduce test suite run time
- Parallelize independent steps

---

## Contact

For unresolved issues:
- GitHub: Open issue in `littlebearapps/homeostat`
- Docs: [API.md](API.md), [RUNBOOK.md](RUNBOOK.md)
