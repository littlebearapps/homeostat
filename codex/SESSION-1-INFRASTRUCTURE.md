# Codex Session 1: Infrastructure - Multi-Repository Support + Self-Healing Loop

**Estimated Duration**: 10-14 hours
**Objective**: Build complete infrastructure for multi-repo support and self-healing loop with feature flag controls
**Branch**: `feature/high-priority-enhancements`

---

## Prerequisites

**Before starting**:
- ✅ Homeostat Phase 0-1 + P0-P6 complete (193/193 tests passing)
- ✅ All documentation in `docs/HIGH-PRIORITY-ENHANCEMENTS-PLAN.md` reviewed
- ✅ Clean git status on `main` branch

**Reference Documents**:
- `docs/HIGH-PRIORITY-ENHANCEMENTS-PLAN.md` - Complete implementation plan
- `docs/REMAINING-TASKS.md` - Deployment checklist
- `homeostat/orchestrator.ts` - Integration point for new infrastructure

---

## Step 1: Create Feature Branch

```bash
cd /Users/nathanschram/claude-code-tools/lba/tools/homeostat/main
git checkout main
git pull origin main
git checkout -b feature/high-priority-enhancements
git push -u origin feature/high-priority-enhancements
```

---

## Step 2: Priority 1 - Multi-Repository Support (4-6 hours)

### Problem Statement
Currently, each extension needs separate Homeostat installation (duplicate workflow files, 3x maintenance burden). Solution: Central Homeostat repo handles all 3 extensions from one workflow.

### Implementation Tasks

#### Task 2.1: Create Multi-Repo Configuration (`.homeostat/repos.yml`)

**File**: `.homeostat/repos.yml`

```yaml
version: 1
repositories:
  - slug: littlebearapps/convert-my-file
    branch: main
    max_prs_per_run: 2
    labels: [homeostat-fix, convert-my-file]
    path_filters:
      include: [src/, content/, background/]
      exclude: [tests/, docs/]
    test_command: npm test
    confidence_threshold: 0.8

  - slug: littlebearapps/notebridge
    branch: main
    max_prs_per_run: 2
    labels: [homeostat-fix, notebridge]
    path_filters:
      include: [src/, content/, background/]
      exclude: [tests/, docs/]
    test_command: npm test
    confidence_threshold: 0.8

  - slug: littlebearapps/palette-kit
    branch: main
    max_prs_per_run: 2
    labels: [homeostat-fix, palette-kit]
    path_filters:
      include: [src/, content/, background/]
      exclude: [tests/, docs/]
    test_command: npm test
    confidence_threshold: 0.8
```

**Validation**:
- File parses correctly with `yq` or YAML parser
- All required fields present (slug, branch, max_prs_per_run, labels, path_filters, test_command)

#### Task 2.2: Implement Repo Manager (`homeostat/multi-repo/repo-manager.ts`)

**File**: `homeostat/multi-repo/repo-manager.ts`

**Requirements**:
- TypeScript class `RepoManager`
- Methods:
  - `cloneShallow(pat: string): Promise<string>` - Clone with `--depth=1` for speed
  - `hasExistingPR(fingerprint: string): Promise<boolean>` - Search open PRs
  - `createOrUpdatePR(params): Promise<{number: number; created: boolean}>` - Create/update PR
  - `applyPathFilters(files: string[]): boolean` - Validate changed files

**Example Implementation Skeleton**:
```typescript
import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RepoConfig {
  slug: string;
  branch: string;
  maxPRsPerRun: number;
  labels: string[];
  pathFilters: { include: string[]; exclude: string[] };
  testCommand: string;
  confidenceThreshold: number;
}

export class RepoManager {
  private octokit: Octokit;
  private config: RepoConfig;

  constructor(config: RepoConfig, pat: string) {
    this.config = config;
    this.octokit = new Octokit({ auth: pat });
  }

  async cloneShallow(workdir: string): Promise<string> {
    const [owner, repo] = this.config.slug.split('/');
    const cloneUrl = `https://github.com/${this.config.slug}.git`;

    await execAsync(
      `git clone --depth=1 --branch=${this.config.branch} ${cloneUrl} ${workdir}/${repo}`
    );

    return `${workdir}/${repo}`;
  }

  async hasExistingPR(fingerprint: string): Promise<boolean> {
    const [owner, repo] = this.config.slug.split('/');

    const { data: prs } = await this.octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100
    });

    return prs.some(pr => pr.title.includes(fingerprint) || pr.body?.includes(fingerprint));
  }

  async createOrUpdatePR(params: {
    fingerprint: string;
    title: string;
    body: string;
    branchName: string;
  }): Promise<{ number: number; created: boolean }> {
    const [owner, repo] = this.config.slug.split('/');

    // Check for existing PR
    const existingPR = await this.findPRByFingerprint(params.fingerprint);

    if (existingPR) {
      // Update existing PR
      await this.octokit.pulls.update({
        owner,
        repo,
        pull_number: existingPR.number,
        body: params.body
      });

      return { number: existingPR.number, created: false };
    }

    // Create new PR
    const { data: pr } = await this.octokit.pulls.create({
      owner,
      repo,
      title: params.title,
      body: params.body,
      head: params.branchName,
      base: this.config.branch
    });

    // Add labels
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: pr.number,
      labels: this.config.labels
    });

    return { number: pr.number, created: true };
  }

  async applyPathFilters(files: string[]): boolean {
    const { include, exclude } = this.config.pathFilters;

    // Check if any file matches include patterns
    const hasIncluded = files.some(file =>
      include.some(pattern => file.startsWith(pattern.replace(/\/$/, '')))
    );

    // Check if any file matches exclude patterns
    const hasExcluded = files.some(file =>
      exclude.some(pattern => file.startsWith(pattern.replace(/\/$/, '')))
    );

    return hasIncluded && !hasExcluded;
  }

  private async findPRByFingerprint(fingerprint: string): Promise<any> {
    const [owner, repo] = this.config.slug.split('/');

    const { data: prs } = await this.octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100
    });

    return prs.find(pr =>
      pr.title.includes(fingerprint) || pr.body?.includes(fingerprint)
    );
  }
}
```

**Acceptance Criteria**:
- ✅ Shallow clone works (<30 seconds for typical repo)
- ✅ PR deduplication prevents duplicates
- ✅ Path filters correctly include/exclude files
- ✅ TypeScript compiles with no errors

#### Task 2.3: Create Multi-Repo Orchestrator Workflow (`.github/workflows/multi-repo-orchestrator.yml`)

**File**: `.github/workflows/multi-repo-orchestrator.yml`

```yaml
name: Multi-Repo Homeostat

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

env:
  HOMEOSTAT_ENV: production  # Feature flag for pattern learning
  LEARNING_ENABLED: true
  APPLY_MODE: propose  # propose | commit
  CONFIDENCE_THRESHOLD: 0.8
  MAX_DIFF_LINES: 500
  MAX_FILES: 10
  MAX_RUN_COST: 1.0  # USD

jobs:
  orchestrate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        repo: [convert-my-file, notebridge, palette-kit]
      max-parallel: 1  # Serialize to avoid rate limits

    steps:
      - name: Checkout Homeostat
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Load Repo Config
        id: config
        run: |
          CONFIG=$(yq e '.repositories[] | select(.slug == "littlebearapps/${{ matrix.repo }}")' .homeostat/repos.yml -o json)
          echo "config=$CONFIG" >> $GITHUB_OUTPUT

      - name: Clone Target Repo
        run: |
          git clone --depth=1 \
            https://x-access-token:${{ secrets.HOMEOSTAT_PAT }}@github.com/littlebearapps/${{ matrix.repo }}.git \
            target-repo

      - name: Run Homeostat
        id: homeostat
        run: |
          node homeostat/multi-repo/orchestrator.js \
            --repo ${{ matrix.repo }} \
            --config '${{ steps.config.outputs.config }}'
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.HOMEOSTAT_PAT }}

      - name: Generate Summary
        if: always()
        run: |
          cat > $GITHUB_STEP_SUMMARY << EOF
          ## Homeostat Run: ${{ matrix.repo }}

          **Repository**: littlebearapps/${{ matrix.repo }}
          **Issues Processed**: ${{ steps.homeostat.outputs.processed }}
          **PRs Created**: ${{ steps.homeostat.outputs.created }}
          **PRs Updated**: ${{ steps.homeostat.outputs.updated }}
          **Fingerprints Cooled Down**: ${{ steps.homeostat.outputs.cooldown }}
          **Cost**: \$${{ steps.homeostat.outputs.cost }}
          **Tokens**: ${{ steps.homeostat.outputs.tokens }}
          EOF
```

**Acceptance Criteria**:
- ✅ Workflow triggers on schedule and manual dispatch
- ✅ Serializes repo processing (max-parallel: 1)
- ✅ Respects environment variables for feature flags
- ✅ Generates summary with metrics

---

## Step 3: Priority 2 - Self-Healing Loop with Feature Flag (6-8 hours)

### Problem Statement
Build COMPLETE pattern learning system NOW with feature flag controls. Allow safe testing (learning disabled) while enabling immediate pattern accumulation from day 1 of production (learning enabled).

### Feature Flag Architecture

**Environment Variable**: `HOMEOSTAT_ENV`

**Valid Values**: `dev` | `test` | `production`

**Behavior Matrix**:

| Component | dev/test | production |
|-----------|----------|------------|
| **PatternMatcher** | ✅ Active (returns null if empty library) | ✅ Active (returns matches if >80% confidence) |
| **PatternExtractor** | ❌ Disabled (logs only) | ✅ Active (extracts patterns from merged PRs) |
| **PatternLearner** | ❌ Disabled (logs only) | ✅ Active (updates success rates) |

### Implementation Tasks

#### Task 3.1: Error Fingerprinter (`shared/patterns/fingerprinter.ts`)

**File**: `shared/patterns/fingerprinter.ts`

**Requirements**:
- Class `FailureFingerprinter`
- Method `normalize(error): ErrorFingerprint`
- Normalize error messages (remove IDs, timestamps, dynamic values)
- Generate consistent fingerprint IDs for same error

**Implementation**:
```typescript
import crypto from 'crypto';

export interface ErrorFingerprint {
  id: string;  // Hash of normalized signature
  errorType: string;
  filePath: string;
  topStackFrame: string;
  messageHash: string;
  fullSignature: string;
}

export class FailureFingerprinter {
  static normalize(error: {
    type: string;
    message: string;
    stack: string;
  }): ErrorFingerprint {
    // Extract file path from stack
    const filePath = this.extractFilePath(error.stack);

    // Get top stack frame
    const topFrame = error.stack.split('\n')[0];

    // Hash message (remove dynamic parts like IDs, timestamps)
    const normalized = error.message
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{32}/g, 'HASH')
      .replace(/[a-f0-9-]{36}/g, 'UUID')
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
      .replace(/\d{2}:\d{2}:\d{2}/g, 'TIME');

    const messageHash = crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 8);

    const signature = `${error.type}:${filePath}:${messageHash}`;
    const id = crypto.createHash('sha256').update(signature).digest('hex').slice(0, 12);

    return {
      id,
      errorType: error.type,
      filePath,
      topStackFrame: topFrame,
      messageHash,
      fullSignature: signature
    };
  }

  private static extractFilePath(stack: string): string {
    const match = stack.match(/at .+ \((.+):(\d+):(\d+)\)/);
    if (match) {
      return match[1];
    }

    const altMatch = stack.match(/(.+):(\d+):(\d+)$/m);
    return altMatch ? altMatch[1] : 'unknown';
  }
}
```

**Acceptance Criteria**:
- ✅ Same error generates same fingerprint ID
- ✅ Different errors generate different fingerprint IDs
- ✅ Dynamic values (IDs, timestamps) normalized correctly

#### Task 3.2: Attempt Store (`shared/patterns/attempt-store.ts`)

**File**: `shared/patterns/attempt-store.ts`

**Requirements**:
- Class `AttemptStore`
- State persistence (PR comments + branch JSON)
- Cooldown logic (24h backoff, max 3 attempts)
- Exponential backoff calculation

**Implementation**: See HIGH-PRIORITY-ENHANCEMENTS-PLAN.md lines 226-260

**Acceptance Criteria**:
- ✅ State persists across workflow runs
- ✅ Cooldown prevents retries within 24 hours
- ✅ Max 3 attempts enforced
- ✅ Exponential backoff works (24h, 48h, 96h)

#### Task 3.3: Pattern Matcher (`shared/patterns/matcher.ts`)

**File**: `shared/patterns/matcher.ts`

**Requirements**:
- FULL implementation (not stub)
- Exact matching by fingerprint ID
- Fuzzy matching (same file + error type)
- Confidence threshold (≥80%)
- Always active (returns null if library empty)

**Implementation**: See HIGH-PRIORITY-ENHANCEMENTS-PLAN.md lines 271-350

**Acceptance Criteria**:
- ✅ Exact matches work (fingerprint ID)
- ✅ Fuzzy matches work (file + error type)
- ✅ Confidence threshold enforced (≥80%)
- ✅ Returns null when library empty (safe in dev/test)

#### Task 3.4: Pattern Extractor (`shared/patterns/extractor.ts`)

**File**: `shared/patterns/extractor.ts`

**Requirements**:
- FULL implementation with feature flag
- Extract patterns from successful PRs
- Feature flag check: `HOMEOSTAT_ENV !== 'production'` → return null
- Add to library with deduplication

**Implementation**: See HIGH-PRIORITY-ENHANCEMENTS-PLAN.md lines 353-471

**Acceptance Criteria**:
- ✅ Feature flag respected (disabled in dev/test, enabled in prod)
- ✅ Patterns extracted from merged PRs only
- ✅ Deduplication prevents duplicate patterns
- ✅ Library grows in production mode

#### Task 3.5: Pattern Learner (`shared/patterns/learner.ts`)

**File**: `shared/patterns/learner.ts`

**Requirements**:
- FULL implementation with feature flag
- Update success rates (exponential moving average, α = 0.1)
- Retire low-performing patterns (<50% after 10+ uses)
- Feature flag check: `HOMEOSTAT_ENV !== 'production'` → return

**Implementation**: See HIGH-PRIORITY-ENHANCEMENTS-PLAN.md lines 474-580

**Acceptance Criteria**:
- ✅ Feature flag respected (disabled in dev/test, enabled in prod)
- ✅ Success rates updated with exponential moving average
- ✅ Low-performing patterns retired (<50% after 10 uses)
- ✅ Learning works in production mode

#### Task 3.6: Pattern Library (`shared/patterns/library.json`)

**File**: `shared/patterns/library.json`

**Initial Content**:
```json
{
  "version": 1,
  "patterns": [],
  "metadata": {
    "lastUpdated": "2025-10-24T00:00:00Z",
    "totalPatterns": 0,
    "note": "Pattern library starts empty. In PRODUCTION mode, patterns are extracted from successful PRs and learned from results."
  }
}
```

**Acceptance Criteria**:
- ✅ Valid JSON
- ✅ Empty patterns array
- ✅ Metadata includes note about production-only extraction

---

## Step 4: Integration into Orchestrator

**File**: `homeostat/orchestrator.ts`

**Requirements**:
Add pattern learning pipeline BEFORE existing AI tier selection:

1. Fingerprint the error
2. Check attempt state (cooldown logic)
3. Try pattern matching (zero-cost fix)
4. If no pattern match, fallback to AI tier logic
5. Extract pattern from successful AI fix (feature flag controlled)

**Integration Code**: See HIGH-PRIORITY-ENHANCEMENTS-PLAN.md lines 638-696

**Acceptance Criteria**:
- ✅ Fingerprinting runs before AI tier selection
- ✅ Cooldown prevents infinite retry loops
- ✅ Pattern matching attempts zero-cost fix first
- ✅ Fallback to AI tier when no pattern match
- ✅ Pattern extraction runs after successful AI fix (prod only)
- ✅ No regressions to existing AI flow

---

## Step 5: Testing & Validation

### Unit Tests

**Create**: `tests/unit/multi-repo/repo-manager.test.ts`
- Test shallow cloning
- Test PR deduplication
- Test path filters

**Create**: `tests/unit/patterns/fingerprinter.test.ts`
- Test consistent ID generation
- Test normalization (IDs, timestamps, etc.)
- Test file path extraction

**Create**: `tests/unit/patterns/attempt-store.test.ts`
- Test state persistence
- Test cooldown logic
- Test exponential backoff

**Create**: `tests/unit/patterns/matcher.test.ts`
- Test exact matching
- Test fuzzy matching
- Test confidence threshold
- Test empty library safety

**Create**: `tests/unit/patterns/extractor.test.ts`
- Test feature flag behavior (dev vs prod)
- Test pattern extraction from PRs
- Test deduplication

**Create**: `tests/unit/patterns/learner.test.ts`
- Test feature flag behavior (dev vs prod)
- Test success rate updates
- Test pattern retirement

### Integration Tests

**Create**: `tests/integration/multi-repo.test.ts`
- Test multi-repo workflow with 3 repos
- Test PR budget enforcement (max 2 per repo)
- Test path filters
- Test rate limiting

**Create**: `tests/integration/self-healing-flow.test.ts`
- Test complete flow: fingerprint → attempt store → pattern match → AI fallback → pattern extraction
- Test feature flag behavior in dev/test modes
- Test zero-cost pattern fixes (with mock patterns)

### Test Execution

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/unit/multi-repo/
npm test -- tests/unit/patterns/
npm test -- tests/integration/

# Check coverage
npm run test:coverage
```

**Acceptance Criteria**:
- ✅ All new tests passing
- ✅ No regressions in existing 193 tests
- ✅ Coverage ≥95% on new modules
- ✅ TypeScript compiles with no errors

---

## Step 6: Documentation

### Update Existing Files

**File**: `CLAUDE.md`
- Add note about multi-repo support
- Add note about self-healing loop with feature flag
- Update "Current Focus" section

**File**: `README.md`
- Update "Features" section
- Add note about multi-repo support
- Add note about pattern learning with feature flag

### Create New Docs

**File**: `docs/MULTI-REPO-GUIDE.md`
- Explain multi-repo architecture
- Explain configuration format (`.homeostat/repos.yml`)
- Explain how to add new repositories

**File**: `docs/FINGERPRINTING.md`
- Explain error fingerprinting algorithm
- Explain attempt store and cooldown logic
- Explain pattern matching (exact vs fuzzy)

---

## Completion Summary Template

**Instructions**: Fill out this checklist when Session 1 is complete. Copy/paste into a comment or file for handoff to Session 2.

```markdown
## Codex Session 1 Completion Report

### Branch Status
- [x] Feature branch created: `feature/high-priority-enhancements`
- [x] All commits pushed to origin

### Priority 1: Multi-Repository Support
- [ ] `.homeostat/repos.yml` created (XX lines)
- [ ] `homeostat/multi-repo/repo-manager.ts` created (XXX lines)
- [ ] `.github/workflows/multi-repo-orchestrator.yml` created (XX lines)
- [ ] Unit tests created: `tests/unit/multi-repo/repo-manager.test.ts` (X tests)
- [ ] All multi-repo tests passing

### Priority 2: Self-Healing Loop
- [ ] `shared/patterns/fingerprinter.ts` created (XXX lines)
- [ ] `shared/patterns/attempt-store.ts` created (XXX lines)
- [ ] `shared/patterns/matcher.ts` created (XXX lines - FULL implementation)
- [ ] `shared/patterns/extractor.ts` created (XXX lines - FULL implementation with feature flag)
- [ ] `shared/patterns/learner.ts` created (XXX lines - FULL implementation with feature flag)
- [ ] `shared/patterns/library.json` created (empty)
- [ ] Unit tests created:
  - [ ] `tests/unit/patterns/fingerprinter.test.ts` (X tests)
  - [ ] `tests/unit/patterns/attempt-store.test.ts` (X tests)
  - [ ] `tests/unit/patterns/matcher.test.ts` (X tests)
  - [ ] `tests/unit/patterns/extractor.test.ts` (X tests)
  - [ ] `tests/unit/patterns/learner.test.ts` (X tests)
- [ ] All pattern tests passing

### Integration
- [ ] `homeostat/orchestrator.ts` modified (added XXX lines)
- [ ] Integration test created: `tests/integration/multi-repo.test.ts` (X tests)
- [ ] Integration test created: `tests/integration/self-healing-flow.test.ts` (X tests)
- [ ] All integration tests passing

### Testing Results
- [ ] All new tests passing (X/X)
- [ ] No regressions in existing tests (193/193)
- [ ] TypeScript compiles with no errors
- [ ] Coverage ≥95% on new modules

### Documentation
- [ ] `CLAUDE.md` updated
- [ ] `README.md` updated
- [ ] `docs/MULTI-REPO-GUIDE.md` created
- [ ] `docs/FINGERPRINTING.md` created

### What Works
- Multi-repository support: [describe]
- Error fingerprinting: [describe]
- Attempt store + cooldown: [describe]
- Pattern matching: [describe]
- Pattern extraction (feature flag): [describe]
- Pattern learning (feature flag): [describe]

### Known Issues/TODOs for Session 2
- [ ] List any blockers or incomplete work
- [ ] List any edge cases discovered
- [ ] List any needed refactors

### Feature Flag Validation
- [ ] Verified: Pattern extraction disabled in dev/test mode
- [ ] Verified: Pattern learning disabled in dev/test mode
- [ ] Verified: Pattern matching works in all modes (returns null if empty)

### Ready for Session 2
- [ ] Yes / No (explain if no)

### Git Commands Run
```bash
git add .
git commit -m "feat: implement multi-repo support + self-healing loop with feature flag

- Multi-repository support with central workflow
- Error fingerprinting with consistent ID generation
- Attempt store with 24h cooldown and exponential backoff
- Pattern matcher (exact + fuzzy matching, 80% confidence threshold)
- Pattern extractor with HOMEOSTAT_ENV feature flag (prod only)
- Pattern learner with exponential moving average (prod only)
- Empty pattern library (grows in production)
- Integration into orchestrator (pattern matching before AI fallback)
- 193/193 tests passing + XX new tests
- Coverage ≥95% on new modules

Feature flag architecture:
- dev/test: Pattern extraction disabled, matching works (returns null if empty)
- production: Full pattern learning enabled from day 1
"
git push origin feature/high-priority-enhancements
```

### Time Spent
- Setup: X hours
- Multi-repo: X hours
- Self-healing: X hours
- Testing: X hours
- Documentation: X hours
- **Total**: XX hours
```

---

## Safety Notes

1. **Do NOT skip tests** - All acceptance criteria must be met
2. **Do NOT commit broken code** - TypeScript must compile, tests must pass
3. **Do NOT hardcode secrets** - Use environment variables only
4. **Do NOT skip feature flag checks** - Pattern extraction/learning MUST respect HOMEOSTAT_ENV
5. **Verify empty library safety** - Pattern matcher MUST return null when library is empty

---

## Questions or Issues?

If you encounter blockers:
1. Document the issue in "Known Issues/TODOs for Session 2"
2. Commit working code so far
3. Report back for guidance

**Expected Duration**: 10-14 hours (autonomous execution)
**Next Session**: Session 2 will handle integration, observability, and E2E validation
