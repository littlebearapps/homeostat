# Homeostat Operational Runbook

## Common Scenarios

### Scenario 1: Fix Failed - Tests Not Passing

**Symptom**: Issue comment says "⚠️ Tests failed after applying fix"

**Diagnosis**:
1. Check GitHub Actions logs for test output
2. Review generated patch in workflow artifacts
3. Verify test suite is up-to-date

**Resolution**:
- **Option A**: Manually review and fix
- **Option B**: Close issue, add `manual-review` label
- **Option C**: Retry with forced Tier 3 (GPT-5)

**Prevent Recurrence**:
- Ensure test suite covers edge cases
- Review tier thresholds if Tier 1 failing frequently

---

### Scenario 2: Cost Exceeded Budget

**Symptom**: SLO check shows projected cost > $10/year

**Diagnosis**:
```bash
npm run cost:check
# Review breakdown by tier
```

**Resolution**:
1. **Short-term**: Pause Homeostat (disable workflow)
2. **Identify cause**: Check tier distribution
   - Too many Tier 3 fixes? → Adjust thresholds
   - Retry logic excessive? → Reduce max attempts
3. **Adjust configuration**:
   ```javascript
   // homeostat/routing/model-selector.js
   // Increase Tier 1 threshold from 5 to 7 stack lines
   if (stackDepth < 7 && fileCount === 1) {
     return { tier: 1, ... };
   }
   ```

**Prevent Recurrence**:
- Monitor costs weekly with `npm run slo:check`
- Set up alerts for budget thresholds

---

### Scenario 3: Rate Limit Hit (GitHub API 403)

**Symptom**: Workflow fails with "Rate limit exceeded"

**Diagnosis**:
- Check workflow logs for `403` status code
- Verify primary/secondary rate limits

**Resolution**:
- **Automatic**: Workflow retries with exponential backoff
- **Manual**: Wait 1 hour for rate limit reset

**Prevent Recurrence**:
- Reduce workflow frequency
- Use GITHUB_TOKEN (higher limits than PAT)

---

### Scenario 4: Malicious Patch Blocked

**Symptom**: Issue comment says "⚠️ Blocked: Malicious code detected"

**Diagnosis**:
1. Review workflow logs for block reason:
   - Sensitive file modification (`manifest.json`, `auth.js`)
   - Suspicious pattern (`eval()`, `exec()`)
2. Check if legitimate fix misclassified

**Resolution**:
- **False positive**: Whitelist pattern, retry
- **Actual malicious**: Close issue, investigate Logger

**Prevent Recurrence**:
- Refine malicious pattern detection
- Review Logger for compromise

---

### Scenario 5: PII Leak Detected

**Symptom**: Security test fails with "PII detected in logs"

**Diagnosis**:
```bash
npm run test:security
# Review failed assertions
```

**Resolution**:
1. **Critical**: Disable Homeostat immediately
2. Identify leak source in logs
3. Update sanitizer patterns
4. Re-run security tests
5. Re-enable after validation

**Prevent Recurrence**:
- Expand PII corpus in `security/pii-corpus.txt`
- Add new patterns to sanitizer

---

### Scenario 6: All Fixes Failing (Success Rate <20%)

**Symptom**: Metrics show <20% success rate

**Diagnosis**:
```bash
npm run metrics:export
# Check tier-specific success rates
```

**Possible Causes**:
- Test suite broken
- Extension codebase changed significantly
- AI model degradation

**Resolution**:
1. Verify test suite works locally: `npm test`
2. Check recent extension changes for breaking changes
3. Consider retraining or adjusting prompts (manual)

---

## Rollback Procedures

### Emergency Stop

**When**: PII leak, runaway costs, or critical bug

**Steps**:
1. Disable workflow:
   ```bash
   # Edit .github/workflows/homeostat.yml
   # Change trigger to: workflow_dispatch
   git commit -m "chore: disable homeostat emergency"
   git push
   ```
2. Alert team
3. Investigate root cause
4. Fix and re-enable after validation

### Revert to Previous Version

**When**: New Homeostat version introduced bugs

**Steps**:
```bash
cd homeostat
git log --oneline  # Find working commit
git checkout <commit-hash>
npm ci
npm test
```

Update workflow to use specific commit hash.

---

## Monitoring Checklist

### Daily
- [ ] Check GitHub Actions for failed runs
- [ ] Review cost metrics (`npm run cost:check`)

### Weekly
- [ ] Run SLO check (`npm run slo:check`)
- [ ] Review success rates by tier
- [ ] Check for PII leaks (`npm run test:security`)

### Monthly
- [ ] Review tier distribution (adjust thresholds if needed)
- [ ] Audit sanitizer patterns for new PII types
- [ ] Update dependencies (`npm audit`, `npm update`)

---

## Escalation

### When to Escalate

- PII leak detected
- Projected cost >$15/year
- Success rate <50% for 7 days
- Malicious activity suspected

### Escalation Contact

- **Primary**: Engineering lead
- **Secondary**: Security team (for PII/malicious activity)

---

## Maintenance

### Updating API Keys

1. Generate new keys on DeepSeek/OpenAI platforms
2. Update GitHub Secrets
3. Test with dry-run: `HOMEOSTAT_DRY_RUN=true npm run bench`
4. Monitor first 10 fixes closely

### Updating Tier Thresholds

Edit `homeostat/routing/model-selector.js`:
```javascript
// Increase Tier 1 to capture more simple errors
if (stackDepth < 7 && fileCount === 1) {  // Was 5
  return { tier: 1, ... };
}
```

Test impact:
```bash
npm run bench
# Verify cost and success rate
```

---

## References

- [Deployment Guide](DEPLOYMENT.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [SLO Definitions](SLOs.md)
