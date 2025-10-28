# Circuit Breaker Migration: File-Based → GitHub Metadata

**Date**: 2025-10-28
**Status**: Phase 1 Implementation
**Timeline**: 4-6 hours

---

## Overview

Migrating from **file-based circuit breaker** (`.homeostat/attempt-store.json`) to **GitHub metadata circuit breaker** (labels + comments).

---

## Why Migrate?

### File-Based Problems ❌
- **Not visible in GitHub UI** - Can't see hop count on issues
- **Not distributed** - Multiple Homeostat instances would conflict
- **Not auditable** - No audit trail of attempts
- **Not manually resettable** - Must edit JSON file or delete entry

### GitHub Metadata Benefits ✅
- **Visible in UI** - Users can see hop count, circuit breaker status on issue
- **Distributed** - Multiple Homeostat instances can read labels (horizontal scaling ready)
- **Auditable** - Signed comments provide full audit trail
- **Manual reset** - Users can remove `circuit-breaker` label to retry
- **Idempotent** - PR existence check + identical diff detection prevents duplicates

---

## Architecture Comparison

### File-Based (Current)
```
Check Circuit Breaker
    ↓
Read `.homeostat/attempt-store.json`
    ↓
Check: fingerprint.exhausted?
    ↓
Check: fingerprint.cooldownUntil > now?
    ↓
If OK: Attempt fix
    ↓
Update JSON file (increment attempts, set cooldown)
    ↓
Write to `.homeostat/attempt-store.json`
```

**Problems**:
- Race condition if 2 workflows run simultaneously
- Not visible in GitHub UI
- No audit trail

---

### GitHub Metadata (Improved)
```
Check Circuit Breaker
    ↓
Read issue labels via GitHub API
    ↓
Check: issue has 'circuit-breaker' label?
    ↓
Check: current hop >= max hops (3)?
    ↓
Check: PR already exists for this issue? (idempotency)
    ↓
If OK: Increment hop BEFORE attempting fix
    ↓
Remove old hop label (e.g., hop:1)
    ↓
Add new hop label (e.g., hop:2)
    ↓
Add signed comment (audit trail)
    ↓
Attempt fix
    ↓
If max hops reached: Add 'circuit-breaker' label
```

**Benefits**:
- Atomic via GitHub API (no race conditions)
- Visible in UI
- Full audit trail (signed comments)

---

## Labels Created

Run `scripts/setup-circuit-breaker-labels.ts` to create:

| Label | Color | Description |
|-------|-------|-------------|
| `hop:0` | 🟢 Green | No autofix attempts yet |
| `hop:1` | 🟡 Yellow | First autofix attempt |
| `hop:2` | 🟠 Orange | Second autofix attempt |
| `hop:3` | 🔴 Red | Third autofix attempt (final) |
| `circuit-breaker` | 🛑 Dark Red | Circuit breaker tripped, needs manual intervention |
| `autofix:attempted` | 🟣 Purple | Homeostat has attempted fix |
| `autofix:success` | 🟢 Green | Autofix succeeded (PR merged) |
| `autofix:failed` | 🔴 Red | Autofix failed (PR closed without merge) |

---

## Usage

### Setup (One-Time)

```bash
# Navigate to Homeostat
cd ~/claude-code-tools/lba/tools/homeostat/main

# Create labels on all extension repos
export GITHUB_TOKEN="your-github-token"
npm run setup:labels
# OR
npx tsx scripts/setup-circuit-breaker-labels.ts
```

---

### In Homeostat Workflow

```typescript
import { Octokit } from '@octokit/rest';
import { GitHubCircuitBreaker } from '../shared/patterns/github-circuit-breaker.js';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const circuitBreaker = new GitHubCircuitBreaker({
  octokit,
  owner: 'littlebearapps',
  repo: 'notebridge',
  maxHops: 3
});

// BEFORE attempting fix
const state = await circuitBreaker.canAttempt(issueNumber);
if (!state.allowed) {
  console.log(`Circuit breaker blocked: ${state.reason}`);

  if (state.reason === 'max_hops_reached') {
    await circuitBreaker.tripCircuitBreaker(issueNumber, 'Max hops reached');
  }

  return;
}

// Increment hop BEFORE attempting fix (prevents race conditions)
await circuitBreaker.incrementHop(issueNumber, {
  trace: generateTraceId(),
  reason: 'autofix-attempt',
  timestamp: new Date().toISOString()
});

// Attempt fix...
const fix = await generateFix(issue);

// Create PR...
const pr = await createPR(fix);

// If PR merged later
await circuitBreaker.markSuccess(issueNumber);

// If PR closed without merge
await circuitBreaker.markFailure(issueNumber);
```

---

## Migration Steps

### Step 1: Deploy New Code (Non-Breaking)
- ✅ `github-circuit-breaker.ts` created
- ✅ Labels setup script created
- ⏸️ Tests created (next step)
- ⏸️ Workflow updated to use new circuit breaker (next step)

### Step 2: Create Labels on Extension Repos (5 min)
```bash
export GITHUB_TOKEN="your-github-token"
npm run setup:labels
```

Expected output:
```
🏷️  Setting up circuit breaker labels on extension repositories...

📦 littlebearapps/notebridge
✓ Created label: hop:0
✓ Created label: hop:1
✓ Created label: hop:2
✓ Created label: hop:3
✓ Created label: circuit-breaker
✓ Created label: autofix:attempted
✓ Created label: autofix:success
✓ Created label: autofix:failed
✅ Labels created successfully

📦 littlebearapps/convert-my-file
...
✅ Labels created successfully

📦 littlebearapps/palette-kit
...
✅ Labels created successfully

🎉 Circuit breaker labels setup complete!
```

### Step 3: Update Homeostat Workflow (2-3 hours)
- Replace `AttemptStore` with `GitHubCircuitBreaker` in workflow
- Update tests to use GitHub API mocks
- Test with staging issues

### Step 4: Deploy to Production (30 min)
- Merge PR to main
- Homeostat workflows start using GitHub metadata
- File-based circuit breaker deprecated (keep for 1 week backup)

### Step 5: Remove File-Based Circuit Breaker (1 week later)
- Delete `.homeostat/attempt-store.json`
- Delete `shared/patterns/attempt-store.ts`
- Delete related tests

---

## Backward Compatibility

During migration (Steps 1-4):
- Both circuit breakers can coexist
- File-based circuit breaker still works for existing issues
- New issues use GitHub metadata circuit breaker
- No data loss, graceful migration

---

## Testing

### Unit Tests

```typescript
import { GitHubCircuitBreaker } from '../shared/patterns/github-circuit-breaker.js';

// Mock Octokit
const mockOctokit = {
  issues: {
    get: jest.fn(),
    addLabels: jest.fn(),
    removeLabel: jest.fn(),
    createComment: jest.fn()
  }
};

describe('GitHubCircuitBreaker', () => {
  it('should allow attempt when hop:0', async () => {
    mockOctokit.issues.get.mockResolvedValue({
      data: { labels: [{ name: 'robot' }, { name: 'hop:0' }] }
    });

    const cb = new GitHubCircuitBreaker({
      octokit: mockOctokit as any,
      owner: 'littlebearapps',
      repo: 'notebridge'
    });

    const state = await cb.canAttempt(123);
    expect(state.allowed).toBe(true);
    expect(state.currentHop).toBe(0);
  });

  it('should block attempt when circuit-breaker label present', async () => {
    mockOctokit.issues.get.mockResolvedValue({
      data: { labels: [{ name: 'robot' }, { name: 'hop:3' }, { name: 'circuit-breaker' }] }
    });

    const cb = new GitHubCircuitBreaker({
      octokit: mockOctokit as any,
      owner: 'littlebearapps',
      repo: 'notebridge'
    });

    const state = await cb.canAttempt(123);
    expect(state.allowed).toBe(false);
    expect(state.reason).toBe('circuit_breaker_tripped');
  });

  it('should trip circuit breaker when max hops reached', async () => {
    mockOctokit.issues.get.mockResolvedValue({
      data: { labels: [{ name: 'robot' }, { name: 'hop:3' }] }
    });

    const cb = new GitHubCircuitBreaker({
      octokit: mockOctokit as any,
      owner: 'littlebearapps',
      repo: 'notebridge'
    });

    await cb.tripCircuitBreaker(123, 'Max hops reached');

    expect(mockOctokit.issues.addLabels).toHaveBeenCalledWith({
      owner: 'littlebearapps',
      repo: 'notebridge',
      issue_number: 123,
      labels: ['circuit-breaker']
    });
  });
});
```

### Integration Test (Staging)

```bash
# 1. Create test issue in staging repo
gh issue create \
  --repo littlebearapps/notebridge \
  --title "[Test] TypeError: test circuit breaker" \
  --label robot \
  --label hop:0 \
  --body "Test circuit breaker migration"

# 2. Manually trigger Homeostat workflow
gh workflow run homeostat.yml \
  --repo littlebearapps/homeostat \
  --field issue_number=123

# 3. Verify labels updated
gh issue view 123 --repo littlebearapps/notebridge

# Expected: hop:1 label added, hop:0 removed, autofix:attempted added

# 4. Repeat 2 more times to reach hop:3

# 5. Verify circuit breaker trips
# Expected: circuit-breaker label added, comment posted
```

---

## Rollback Plan

If GitHub metadata circuit breaker fails:

1. Revert PR to main (restore file-based circuit breaker)
2. Remove GitHub labels (optional, won't interfere)
3. File-based circuit breaker takes over immediately
4. Investigate failure, fix, re-deploy

**Risk**: LOW (backward compatible, graceful migration)

---

## Manual Operations

### Reset Circuit Breaker (Manual Intervention)

```typescript
const cb = new GitHubCircuitBreaker({
  octokit,
  owner: 'littlebearapps',
  repo: 'notebridge'
});

await cb.reset(issueNumber);
```

**Or via GitHub UI**:
1. Go to issue
2. Remove `circuit-breaker` label
3. Remove all `hop:*` labels
4. Add `hop:0` label
5. Homeostat will retry on next run

---

## Troubleshooting

### Issue 1: Labels not created
**Symptom**: Script fails with "403 Forbidden"
**Cause**: GITHUB_TOKEN lacks `repo` scope
**Fix**: Use token with `repo` scope (or admin:org for org-wide)

### Issue 2: Duplicate PRs created
**Symptom**: Multiple PRs for same issue
**Cause**: PR existence check failing
**Fix**: Verify PR body includes "Fixes #123" format

### Issue 3: Circuit breaker trips immediately
**Symptom**: Issue blocked on first attempt
**Cause**: Issue already has hop:3 or circuit-breaker label
**Fix**: Reset labels via `cb.reset(issueNumber)` or GitHub UI

---

## Success Criteria

✅ **Migration Complete** when:
- [ ] Labels created on all 3 extension repos
- [ ] Homeostat workflow uses `GitHubCircuitBreaker`
- [ ] Tests pass (unit + integration)
- [ ] Staging validation successful (3-hop cycle + trip)
- [ ] Production deployment successful
- [ ] 1 week stable (no file-based circuit breaker needed)
- [ ] File-based circuit breaker removed

---

## Timeline

**Total**: 4-6 hours

| Step | Time | Status |
|------|------|--------|
| 1. Create `github-circuit-breaker.ts` | 2 hours | ✅ Complete |
| 2. Create labels setup script | 30 min | ✅ Complete |
| 3. Create labels on repos | 5 min | ⏸️ Pending |
| 4. Write tests | 1 hour | ⏸️ Pending |
| 5. Update workflow | 1 hour | ⏸️ Pending |
| 6. Staging validation | 30 min | ⏸️ Pending |
| 7. Deploy to production | 30 min | ⏸️ Pending |

---

**Next Steps**: Create unit tests, then update Homeostat workflow to use new circuit breaker
